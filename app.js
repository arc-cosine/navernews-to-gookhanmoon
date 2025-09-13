const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Koyeb 환경 감지
const isProduction = process.env.NODE_ENV === 'production';
const isKoyeb = process.env.KOYEB_DEPLOYMENT_ID || process.env.KOYEB_APP_NAME;

// 복제할 대상 사이트
const TARGET_SITE = 'https://hanjaro.juntong.or.kr';

// 타임아웃 설정 (Koyeb 환경에서 더 짧게)
const REQUEST_TIMEOUT = isKoyeb ? 15000 : 30000; // Koyeb: 15초, 로컬: 30초
const PROXY_TIMEOUT = isKoyeb ? 20000 : 45000;   // 전체 프록시 타임아웃

console.log(`Environment: ${isKoyeb ? 'Koyeb' : 'Local'}`);
console.log(`Request timeout: ${REQUEST_TIMEOUT}ms`);
console.log(`Proxy timeout: ${PROXY_TIMEOUT}ms`);

// POST 데이터 처리를 위한 미들웨어
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 전체 요청 타임아웃 미들웨어
app.use((req, res, next) => {
    // 요청별 타임아웃 설정
    req.setTimeout(PROXY_TIMEOUT);
    res.setTimeout(PROXY_TIMEOUT);

    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.error(`Request timeout: ${req.url}`);
            res.status(408).send('Request timeout');
        }
    }, PROXY_TIMEOUT);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
});

// 정적 파일 제공 (PWA 매니페스트, 서비스 워커, 아이콘)
app.use('/static', express.static(path.join(__dirname, 'public')));

// 아이콘 파일 직접 제공
app.get('/icon.png', (req, res) => {
    const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
    <rect width="192" height="192" fill="#1ec800"/>
    <text x="96" y="120" font-family="Arial, sans-serif" font-size="60" font-weight="bold" text-anchor="middle" fill="white">뉴스</text>
    <circle cx="96" cy="60" r="25" fill="white"/>
    <text x="96" y="70" font-family="Arial, sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="#1ec800">新</text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24시간 캐시
    res.send(svgIcon);
});

// PWA 매니페스트 제공
app.get('/manifest.json', (req, res) => {
    const manifest = {
        "name": "국한문 뉴스",
        "short_name": "국한문 뉴스",
        "description": "네이버 뉴스를 국한문혼용체로 보실 수 있습니다.",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#1ec800",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": "/icon.png",
                "sizes": "192x192",
                "type": "image/svg+xml",
                "purpose": "maskable any"
            },
            {
                "src": "/icon.png",
                "sizes": "512x512",
                "type": "image/svg+xml",
                "purpose": "maskable any"
            }
        ]
    };

    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24시간 캐시
    res.json(manifest);
});

// 서비스 워커 제공
app.get('/sw.js', (req, res) => {
    const serviceWorker = `
const CACHE_NAME = 'naver-news-v1';
const urlsToCache = [
    '/',
    '/icon.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
    `;
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1시간 캐시
    res.send(serviceWorker);
});

// Axios 인스턴스 생성 (공통 설정)
const createAxiosInstance = () => {
    return axios.create({
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 3, // 리다이렉트 수 줄임
        validateStatus: (status) => status < 500, // 4xx도 성공으로 처리
        maxContentLength: isKoyeb ? 5 * 1024 * 1024 : 10 * 1024 * 1024, // 5MB/10MB 제한
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        }
    });
};

// 에러 핸들링 개선
function handleAxiosError(error, targetUrl) {
    if (error.code === 'ECONNABORTED') {
        console.error(`Timeout for ${targetUrl}: ${error.message}`);
        return { status: 408, message: 'Request timeout - 요청 시간 초과' };
    } else if (error.code === 'ENOTFOUND') {
        console.error(`DNS lookup failed for ${targetUrl}: ${error.message}`);
        return { status: 404, message: 'Site not found - 사이트를 찾을 수 없습니다' };
    } else if (error.response) {
        console.error(`HTTP ${error.response.status} for ${targetUrl}`);
        return { status: error.response.status, message: `HTTP ${error.response.status} Error` };
    } else {
        console.error(`Network error for ${targetUrl}: ${error.message}`);
        return { status: 500, message: 'Network error - 네트워크 오류' };
    }
}

// ASP.NET ViewState와 기타 폼 데이터 처리 + PWA 기능 추가 (최적화)
function processAspNetForm(html, baseUrl) {
    try {
        const $ = cheerio.load(html, {
            decodeEntities: false, // 성능 향상
            lowerCaseAttributeNames: false
        });

        // 페이지 제목을 항상 "네이버 뉴스"로 변경
        $('title').text('네이버 뉴스');

        // 기존 메타 태그들 제거하고 PWA 메타 태그 추가
        $('head').prepend(`
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="theme-color" content="#1ec800">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-status-bar-style" content="default">
            <meta name="apple-mobile-web-app-title" content="네이버 뉴스">
            <link rel="manifest" href="/manifest.json">
            <link rel="apple-touch-icon" href="/icon.png">
            <link rel="icon" type="image/png" sizes="192x192" href="/icon.png">
            <link rel="icon" type="image/png" sizes="512x512" href="/icon.png">
        `);

        // 서비스 워커 등록 스크립트 (간소화)
        $('head').append(`
            <script>
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', function() {
                        navigator.serviceWorker.register('/sw.js')
                            .then(function(registration) {
                                console.log('ServiceWorker 등록 성공');
                            })
                            .catch(function(err) {
                                console.error('ServiceWorker 등록 실패:', err);
                            });
                    });
                }
            </script>
        `);

        // 특정 요소들 삭제
        $('header#header').remove();
        $('div#content').remove();
        $('div#footer').remove();

        // 모든 form을 프록시로 변경
        $('form').each(function() {
            const action = $(this).attr('action');
            if (action) {
                try {
                    const absoluteAction = new URL(action, baseUrl).href;
                    const proxyAction = `/proxy?url=${encodeURIComponent(absoluteAction)}`;
                    $(this).attr('action', proxyAction);
                } catch (e) {
                    console.warn('Form action processing error:', action);
                }
            } else {
                $(this).attr('action', `/proxy?url=${encodeURIComponent(baseUrl)}`);
            }
        });

        // 모든 링크를 프록시로 변경
        $('a[href]').each(function() {
            const href = $(this).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const absoluteUrl = new URL(href, baseUrl).href;
                    const proxyUrl = `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                    $(this).attr('href', proxyUrl);
                } catch (e) {
                    // 무시
                }
            }
        });

        // CSS, JS, 이미지 등 리소스 처리 (PWA 파일들은 제외)
        $('link[href], script[src], img[src]').each(function() {
            const attr = $(this).attr('href') ? 'href' : 'src';
            const url = $(this).attr(attr);
            if (url && !url.startsWith('data:')) {
                if (url.includes('manifest.json') || url.includes('/sw.js') || url.includes('/icon.png')) {
                    return;
                }

                try {
                    const absoluteUrl = new URL(url, baseUrl).href;
                    const proxyUrl = `/resource?url=${encodeURIComponent(absoluteUrl)}`;
                    $(this).attr(attr, proxyUrl);
                } catch (e) {
                    // 무시
                }
            }
        });

        return $.html();
    } catch (error) {
        console.error('HTML processing error:', error.message);
        return html; // 원본 HTML 반환
    }
}

// 메인 프록시 라우트 (GET) - 개선된 버전
app.get('/proxy', async (req, res) => {
    const startTime = Date.now();
    const targetUrl = req.query.url || TARGET_SITE;

    console.log(`[GET] Starting proxy request to: ${targetUrl}`);

    try {
        const axiosInstance = createAxiosInstance();

        const response = await axiosInstance.get(targetUrl, {
            headers: {
                'Accept': req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': req.headers['accept-language'] || 'ko-KR,ko;q=0.9,en;q=0.8',
                'Referer': TARGET_SITE
            }
        });

        const duration = Date.now() - startTime;
        console.log(`[GET] Request completed in ${duration}ms`);

        const contentType = response.headers['content-type'] || '';

        if (contentType.includes('text/html')) {
            const processedHtml = processAspNetForm(response.data, targetUrl);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(processedHtml);
        } else {
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            res.send(response.data);
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorInfo = handleAxiosError(error, targetUrl);

        console.error(`[GET] Request failed after ${duration}ms: ${errorInfo.message}`);

        // 사용자 친화적 에러 페이지
        const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>연결 오류 - 네이버 뉴스</title>
        </head>
        <body>
            <h2>연결 오류</h2>
            <p>${errorInfo.message}</p>
            <p>잠시 후 다시 시도해보세요.</p>
            <button onclick="history.back()">뒤로 가기</button>
            <button onclick="location.reload()">새로고침</button>
        </body>
        </html>
        `;

        res.status(errorInfo.status).send(errorHtml);
    }
});

// POST 요청 처리 (개선된 버전)
app.post('/proxy', async (req, res) => {
    const startTime = Date.now();
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL parameter required');
    }

    console.log(`[POST] Starting proxy request to: ${targetUrl}`);

    try {
        const axiosInstance = createAxiosInstance();

        const response = await axiosInstance.post(targetUrl, req.body, {
            headers: {
                'Accept': req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': req.headers['accept-language'] || 'ko-KR,ko;q=0.9,en;q=0.8',
                'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
                'Referer': targetUrl
            }
        });

        const duration = Date.now() - startTime;
        console.log(`[POST] Request completed in ${duration}ms`);

        const contentType = response.headers['content-type'] || '';

        if (contentType.includes('text/html')) {
            const processedHtml = processAspNetForm(response.data, targetUrl);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(processedHtml);
        } else {
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            res.send(response.data);
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorInfo = handleAxiosError(error, targetUrl);

        console.error(`[POST] Request failed after ${duration}ms: ${errorInfo.message}`);
        res.status(errorInfo.status).send(`Error: ${errorInfo.message}`);
    }
});

// 리소스 프록시 (개선된 버전)
app.get('/resource', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('URL parameter required');
    }

    // PWA 관련 파일들은 프록시하지 않고 차단
    if (targetUrl.includes('manifest.json') || targetUrl.includes('/sw.js') || targetUrl.includes('/icon.png')) {
        return res.status(404).send('PWA file should not be proxied');
    }

    try {
        const axiosInstance = createAxiosInstance();

        const response = await axiosInstance.get(targetUrl, {
            headers: {
                'Accept': '*/*',
                'Referer': TARGET_SITE
            },
            responseType: 'arraybuffer'
        });

        // 원본 헤더 복사
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }

        // 캐시 설정
        res.setHeader('Cache-Control', 'public, max-age=3600');

        res.send(response.data);

    } catch (error) {
        console.error('Resource proxy error:', error.message);
        res.status(404).send('Resource not found');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: isKoyeb ? 'koyeb' : 'local',
        timeout: REQUEST_TIMEOUT
    });
});

// 루트 경로
app.get('/', (req, res) => {
    const defaultUrl = 'https://hanjaro.juntong.or.kr/page_translater_mobile.aspx?sURL=http%3a%2f%2fm.news.naver.com&hh=1&hu=1&hl=111111111';
    res.redirect(`/proxy?url=${encodeURIComponent(defaultUrl)}`);
});

// 서버 시작
app.listen(port, 'localhost', () => {
    console.log(`네이버 뉴스 PWA 프록시 서버가 http://localhost:${port} 에서 실행중입니다`);
    console.log(`환경: ${isKoyeb ? 'Koyeb 프로덕션' : '로컬 개발'}`);
    console.log(`복제 대상: ${TARGET_SITE}`);
    console.log(`요청 타임아웃: ${REQUEST_TIMEOUT}ms`);
    console.log('PWA 기능이 활성화되었습니다.');
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
