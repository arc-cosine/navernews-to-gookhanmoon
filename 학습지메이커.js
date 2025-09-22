const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const path = require('path');

const app = express();
const port = 3000;

// 정적 파일 제공
app.use(express.static('.'));

// 메인 HTML 페이지
const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>한자 학습지 생성기</title>
    <style>
        body {
            font-family: 'Malgun Gothic', Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        .input-section {
            margin-bottom: 30px;
            text-align: center;
        }
        input[type="text"] {
            font-size: 28px;
            padding: 15px 20px;
            border: 3px solid #667eea;
            border-radius: 10px;
            width: 200px;
            text-align: center;
            transition: all 0.3s ease;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: #764ba2;
            box-shadow: 0 0 15px rgba(102, 126, 234, 0.3);
            transform: scale(1.05);
        }
        button {
            font-size: 18px;
            padding: 15px 25px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            margin-left: 15px;
            transition: all 0.3s ease;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 1px;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        button:active {
            transform: translateY(0);
        }
        .result-section {
            text-align: center;
            margin-top: 30px;
        }
        .loading {
            color: #666;
            font-style: italic;
            font-size: 18px;
        }
        .error {
            color: #ff4757;
            font-weight: bold;
            background: #ffe1e6;
            padding: 15px;
            border-radius: 8px;
            border-left: 5px solid #ff4757;
        }
        .success {
            color: #2ed573;
            font-weight: bold;
            background: #e8f8f1;
            padding: 15px;
            border-radius: 8px;
            border-left: 5px solid #2ed573;
        }
        img {
            border: 3px solid #ddd;
            border-radius: 10px;
            max-width: 100%;
            height: auto;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        img:hover {
            transform: scale(1.02);
        }
        .download-btn {
            background: linear-gradient(45deg, #2ed573, #17c0eb);
            margin-top: 20px;
        }
        .info {
            background: linear-gradient(45deg, #e3f2fd, #f8f9ff);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            color: #1976d2;
            border: 2px solid #e3f2fd;
        }
        .examples {
            margin-top: 20px;
        }
        .example-char {
            display: inline-block;
            cursor: pointer;
            margin: 5px;
            padding: 10px 15px;
            background: linear-gradient(45deg, #f1f2f6, #dfe4ea);
            border-radius: 8px;
            font-size: 24px;
            font-weight: bold;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }
        .example-char:hover {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            transform: translateY(-3px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>한자 학습지 생성기</h1>
 
        
        <div class="input-section">
            <input type="text" id="characterInput" placeholder="한자 입력 (예: 作)" maxlength="1">
            <button onclick="generateWorksheet()">학습지 생성</button>
        </div>

        <div class="result-section" id="resultSection">
            <div class="examples">
                <p style="color: #666; font-size: 18px; margin-bottom: 15px;">📚 예시 한자를 클릭해보세요:</p>
                <div>
                    <span class="example-char" onclick="tryCharacter('作')">作</span>
                    <span class="example-char" onclick="tryCharacter('学')">学</span>
                    <span class="example-char" onclick="tryCharacter('生')">生</span>
                    <span class="example-char" onclick="tryCharacter('人')">人</span>
                    <span class="example-char" onclick="tryCharacter('大')">大</span>
                    <span class="example-char" onclick="tryCharacter('小')">小</span>
                    <span class="example-char" onclick="tryCharacter('中')">中</span>
                    <span class="example-char" onclick="tryCharacter('国')">国</span>
                    <span class="example-char" onclick="tryCharacter('家')">家</span>
                    <span class="example-char" onclick="tryCharacter('好')">好</span>
                </div>
            </div>
        </div>
    </div>

    <script>
        function getUnicodeNumber(char) {
            return char.charCodeAt(0);
        }

        function tryCharacter(char) {
            document.getElementById('characterInput').value = char;
            generateWorksheet();
        }

        async function generateWorksheet() {
            const input = document.getElementById('characterInput');
            const resultSection = document.getElementById('resultSection');
            const character = input.value.trim();

            if (!character) {
                resultSection.innerHTML = '<div class="error">❌ 한자를 입력해주세요.</div>';
                return;
            }

            if (character.length > 1) {
                resultSection.innerHTML = '<div class="error">❌ 한 글자만 입력해주세요.</div>';
                return;
            }

            const unicode = getUnicodeNumber(character);
            
            // 한자 범위 확인
            if (unicode < 0x4E00 || unicode > 0x9FFF) {
                resultSection.innerHTML = '<div class="error">❌ 올바른 한자를 입력해주세요.</div>';
                return;
            }

            resultSection.innerHTML = '<div class="loading"><div class="spinner"></div>🎨 학습지를 생성하는 중...</div>';

            try {
                const response = await fetch(\`/api/worksheet/\${unicode}\`);
                
                if (response.ok) {
                    const blob = await response.blob();
                    const imageUrl = URL.createObjectURL(blob);
                    
                    resultSection.innerHTML = \`
                        <h3>한자: \${character} (유니코드: \${unicode})</h3>
                        <div style="margin: 20px 0;">
                            <img src="\${imageUrl}" alt="한자 학습지: \${character}" />
                        </div>
                        <a href="\${imageUrl}" download="한자학습지_\${character}.png">
                            <button class="download-btn">학습지 다운로드</button>
                        </a>
                    \`;
                } else {
                    throw new Error('학습지를 찾을 수 없습니다');
                }
            } catch (error) {
                resultSection.innerHTML = \`
                    <div class="error">
                        ❌ 해당 한자 "\${character}"의 학습지를 찾을 수 없습니다.<br>
                        다른 한자를 시도해보세요.
                    </div>
                \`;
            }
        }

        // 엔터키로 생성
        document.getElementById('characterInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                generateWorksheet();
            }
        });
    </script>
</body>
</html>
`;

// 메인 페이지 라우트
app.get('/', (req, res) => {
    res.send(htmlContent);
});

// 학습지 생성 API
app.get('/api/worksheet/:unicode', async (req, res) => {
    try {
        const unicode = req.params.unicode;
        const imageUrl = `https://www.writechinese.com/assets/strokeorder/worksheet/ko/2/${unicode}.png`;

        // 이미지 다운로드
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Sharp로 이미지 처리
        const imageBuffer = Buffer.from(response.data);
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();

        // 워터마크와 QR코드 제거를 위한 빨간색 오버레이 생성 (디버깅용)
        const overlayWidth = metadata.width;
        const overlayHeight = metadata.height;

        // 하단 전체 워터마크 영역 제거용 빨간색 바 (하단 70px)
        const bottomOverlay = Buffer.from(
            `<svg width="${overlayWidth}" height="1000">
                <rect width="${overlayWidth}" height="1000" fill="white"/>
            </svg>`
        );

        // QR코드 제거용 빨간색 사각형 (우하단 더 정확한 위치)
        const qrOverlay = Buffer.from(
            `<svg width="170" height="170" xmlns="http://www.w3.org/2000/svg">
  <rect width="170" height="170" fill="white"/>
  <text x="50%" y="50%" 
        text-anchor="middle" 
        dominant-baseline="middle" 
        font-size="150" 
        font-family="serif" 
        fill="gray">
    篤
  </text>
</svg>
`
        );

        // 이미지 합성 - QR코드 위치를 더 정확하게
        const processedImage = await image
            .composite([
                // 먼저 하단 워터마크 덮기
                {
                    input: bottomOverlay,
                    top: overlayHeight - 270,
                    left: 0
                },
                // QR코드 영역 덮기 (우하단 정확한 위치)
                {
                    input: qrOverlay,
                    top: 2490,
                    left:  1760
                }
            ])
            .png()
            .toBuffer();

        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="hanzi_worksheet_${unicode}.png"`
        });

        res.send(processedImage);

    } catch (error) {
        console.error('Error processing worksheet:', error);
        res.status(404).json({
            error: 'Worksheet not found',
            message: error.message
        });
    }
});

// 서버 시작
app.listen(port, () => {
    console.log(`🚀 한자 학습지 생성기가 http://localhost:${port} 에서 실행중입니다!`);
    console.log(`📚 브라우저에서 위 주소로 접속하세요.`);
});

// 필요한 패키지 설치 명령어 (주석)
/*
npm install express axios sharp

사용법:
1. 이 파일을 app.js로 저장
2. 터미널에서: npm install express axios sharp
3. 터미널에서: node app.js
4. 브라우저에서 http://localhost:3000 접속
*/
