const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 복제할 대상 사이트
const TARGET_SITE = 'https://hanjaro.juntong.or.kr';

// POST 데이터 처리를 위한 미들웨어
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 정적 파일 제공 (PWA 매니페스트, 서비스 워커, 아이콘)
app.use('/static', express.static(path.join(__dirname, 'public')));

// 아이콘 파일 직접 제공 (public 폴더 없이도 동작하도록)
app.get('/icon.png', (req, res) => {
    // 간단한 SVG 아이콘을 제공
    const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
    <rect width="192" height="192" fill="#1ec800"/>
    <text x="96" y="120" font-family="Arial, sans-serif" font-size="60" font-weight="bold" text-anchor="middle" fill="white">뉴스</text>
    <circle cx="96" cy="60" r="25" fill="white"/>
    <text x="96" y="70" font-family="Arial, sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="#1ec800">新</text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
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
    res.send(serviceWorker);
});

// ASP.NET ViewState와 기타 폼 데이터 처리 + PWA 기능 추가
function processAspNetForm(html, baseUrl) {
    const $ = cheerio.load(html);

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

    // 서비스 워커 등록 및 PWA 체크 스크립트 추가
    $('head').append(`
        <script>
            // PWA 설치 가능 여부 체크
            function checkPWAInstallability() {
                console.log('=== PWA 설치 가능성 체크 ===');
                
                // 매니페스트 체크
                fetch('/manifest.json')
                    .then(response => response.json())
                    .then(manifest => {
                        console.log('✅ 매니페스트 로드됨:', manifest);
                    })
                    .catch(err => {
                        console.error('❌ 매니페스트 로드 실패:', err);
                    });
                
                // 서비스 워커 체크
                if ('serviceWorker' in navigator) {
                    console.log('✅ 서비스 워커 지원됨');
                } else {
                    console.warn('❌ 서비스 워커 지원 안됨');
                }
                
                // HTTPS 체크
                if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                    console.log('✅ 보안 컨텍스트 OK');
                } else {
                    console.warn('❌ HTTPS 필요 (로컬은 예외)');
                }
            }
            
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js')
                        .then(function(registration) {
                            console.log('✅ ServiceWorker 등록 성공');
                            checkPWAInstallability();
                        })
                        .catch(function(err) {
                            console.error('❌ ServiceWorker 등록 실패:', err);
                        });
                });
                
                // beforeinstallprompt 이벤트 감지
                window.addEventListener('beforeinstallprompt', (e) => {
                    console.log('🎉 PWA 설치 프롬프트 준비됨!');
                    console.log('브라우저에서 설치 옵션을 찾아보세요.');
                });
                
                // 설치 완료 감지
                window.addEventListener('appinstalled', (evt) => {
                    console.log('🎉 PWA 설치 완료!');
                });
            }
            
            // 30초 후 설치 안내 (사용자 참여도 조건)
            setTimeout(() => {
                console.log('💡 팁: 브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 찾아보세요.');
            }, 30000);
        </script>
    `);

    // 특정 요소들 삭제
    $('header#header').remove();  // header 태그에 id="header"인 요소 삭제
    $('div#content').remove();    // div 태그에 id="content"인 요소 삭제
    $('div#footer').remove();

    // 모든 form을 프록시로 변경
    $('form').each(function() {
        const action = $(this).attr('action');
        if (action) {
            const absoluteAction = new URL(action, baseUrl).href;
            // 프록시 URL로 변경
            const proxyAction = `/proxy?url=${encodeURIComponent(absoluteAction)}`;
            $(this).attr('action', proxyAction);
        } else {
            // action이 없으면 현재 페이지로 설정
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
                console.log('Link processing error:', href);
            }
        }
    });

    // CSS, JS, 이미지 등 리소스 처리 (PWA 파일들은 제외)
    $('link[href], script[src], img[src]').each(function() {
        const attr = $(this).attr('href') ? 'href' : 'src';
        const url = $(this).attr(attr);
        if (url && !url.startsWith('data:')) {
            // PWA 관련 파일들은 프록시하지 않음
            if (url.includes('manifest.json') || url.includes('/sw.js') || url.includes('/icon.png')) {
                return; // 건너뛰기
            }

            try {
                const absoluteUrl = new URL(url, baseUrl).href;
                const proxyUrl = `/resource?url=${encodeURIComponent(absoluteUrl)}`;
                $(this).attr(attr, proxyUrl);
            } catch (e) {
                console.log('Resource processing error:', url);
            }
        }
    });

    return $.html();
}

// 메인 프록시 라우트 (GET)
app.get('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url || TARGET_SITE;
        console.log('GET Proxy target:', targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': req.headers['accept-language'] || 'ko-KR,ko;q=0.9,en;q=0.8',
                'Referer': TARGET_SITE
            },
            timeout: 30000,
            maxRedirects: 5
        });

        // Content-Type에 따라 처리 방식 결정
        const contentType = response.headers['content-type'] || '';

        if (contentType.includes('text/html')) {
            const processedHtml = processAspNetForm(response.data, targetUrl);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(processedHtml);
        } else {
            // HTML이 아닌 경우 그대로 전달
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            res.send(response.data);
        }

    } catch (error) {
        console.error('GET Proxy error:', error.message);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// POST 요청 처리 (ASP.NET 폼 데이터 포함)
app.post('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) {
            return res.status(400).send('URL parameter required');
        }

        console.log('POST Proxy target:', targetUrl);
        console.log('POST Data:', req.body);

        const response = await axios.post(targetUrl, req.body, {
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': req.headers['accept-language'] || 'ko-KR,ko;q=0.9,en;q=0.8',
                'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
                'Referer': targetUrl
            },
            timeout: 30000,
            maxRedirects: 5
        });

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
        console.error('POST Proxy error:', error.message);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// 리소스 프록시 (CSS, JS, 이미지 등)
app.get('/resource', async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) {
            return res.status(400).send('URL parameter required');
        }

        // PWA 관련 파일들은 프록시하지 않고 차단
        if (targetUrl.includes('manifest.json') || targetUrl.includes('/sw.js') || targetUrl.includes('/icon.png')) {
            console.log('Blocked PWA file from proxy:', targetUrl);
            return res.status(404).send('PWA file should not be proxied');
        }

        console.log('Resource proxy:', targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': TARGET_SITE
            },
            timeout: 30000,
            responseType: 'arraybuffer'
        });

        // 원본 헤더 복사
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['cache-control']) {
            res.setHeader('Cache-Control', response.headers['cache-control']);
        } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }

        res.send(response.data);

    } catch (error) {
        console.error('Resource proxy error:', error.message);
        res.status(404).send('Resource not found');
    }
});

// 루트 경로 - 모바일 네이버 뉴스 번역 페이지로 리다이렉트
app.get('/', (req, res) => {
    const defaultUrl = 'https://hanjaro.juntong.or.kr/page_translater_mobile.aspx?sURL=http%3a%2f%2fm.news.naver.com&hh=1&hu=1&hl=111111111';
    res.redirect(`/proxy?url=${encodeURIComponent(defaultUrl)}`);
});

// 서버 시작
app.listen(port, () => {
    console.log(`네이버 뉴스 PWA 프록시 서버가 http://localhost:${port} 에서 실행중입니다`);
    console.log(`복제 대상: ${TARGET_SITE}`);
    console.log('모든 요청이 이 서버를 통해 프록시됩니다.');
    console.log('PWA 기능이 활성화되었습니다.');
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
});
