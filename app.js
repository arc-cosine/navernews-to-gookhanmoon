const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const app = express();
const port = 3000;

// 복제할 대상 사이트
const TARGET_SITE = 'https://hanjaro.juntong.or.kr';

// POST 데이터 처리를 위한 미들웨어
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ASP.NET ViewState와 기타 폼 데이터 처리
function processAspNetForm(html, baseUrl) {
    const $ = cheerio.load(html);

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

    // CSS, JS, 이미지 등 리소스 처리
    $('link[href], script[src], img[src]').each(function() {
        const attr = $(this).attr('href') ? 'href' : 'src';
        const url = $(this).attr(attr);
        if (url && !url.startsWith('data:')) {
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
    console.log(`ASP.NET Site Clone Proxy running at http://localhost:${port}`);
    console.log(`Cloning: ${TARGET_SITE}`);
    console.log('All requests will be proxied through this server.');
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
});
