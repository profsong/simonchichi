import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const filename = `simonchichi-${version}.apk`;
const defaultApk = fileURLToPath(new URL(`../artifacts/android/${filename}`, import.meta.url));
const apkPath = process.argv[2] ? resolve(process.argv[2]) : defaultApk;
const port = Number(process.argv[3] ?? '4180');
const downloadPath = `/download/${filename}`;

if (
  extname(apkPath).toLowerCase() !== '.apk' ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  console.error('사용법: node scripts/serve-android-download.mjs [APK 경로] [포트: 4180]');
  process.exit(1);
}

let apk;
try {
  apk = await readFile(apkPath);
} catch {
  console.error(`APK를 읽을 수 없어요. 먼저 Android APK를 빌드해 주세요.\n${apkPath}`);
  process.exit(1);
}
if (apk.length === 0) {
  console.error('APK 파일이 비어 있어요. 빌드 결과를 확인해 주세요.');
  process.exit(1);
}

// Keep the served bytes and their hash together even if another build replaces the disk file.
const sha256 = createHash('sha256').update(apk).digest('hex');
const checksum = `${sha256}  ${filename}\n`;
const size = (apk.length / 1024 / 1024).toFixed(1);
const page = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>시몬치치 Android 설치</title>
<style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#173b50;background:#f2faff;font-size:16px}
*{box-sizing:border-box}body{margin:0;padding:24px 18px}main{max-width:520px;margin:auto}
h1{font-size:30px;margin:12px 0;color:#0084bf}h2{font-size:19px;margin-top:28px}p,li{line-height:1.7}
.card{background:white;border:1px solid #d4e7f0;border-radius:24px;padding:24px;box-shadow:0 4px 0 #d4e7f0}
.tag{display:inline-block;padding:6px 12px;border-radius:20px;background:#e8f8e0;color:#32691d;font-weight:700}
.download{display:block;min-height:52px;margin:22px 0 12px;padding:14px;text-align:center;border-radius:16px;background:#52ce39;color:#103917;font-weight:800;text-decoration:none;box-shadow:0 4px 0 #30a925}
a:focus-visible{outline:3px solid #087dc0;outline-offset:5px}a{color:#0677b0}ol{padding-left:24px}li+li{margin-top:8px}
.note{font-size:14px;color:#496a7c}.hash{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:12px;background:#edf6fa;padding:12px;border-radius:12px}
</style></head><body><main><div class="card">
<span class="tag">Android ${version} · 개인용 앱</span><h1>시몬치치</h1>
<p>몬치치와 20단어씩, 나만의 영어 모험.<br>APK를 한 번 설치하면 PC를 끄고 오프라인으로 실행할 수 있어요.</p>
<p class="note"><strong>이번 업데이트</strong> · 새 옷 10종을 더해 원래 옷을 포함해 총 14종이 되었어요. 새 일반 옷 7종은 6,000 XP, 나이키 후드티·아디다스 패딩·버버리 코트는 각각 7,000 XP입니다. 세 탐험 친구에게 어울리는 옷과 액세서리를 골라 보세요. 기존 학습 기록과 구매품, XP 잔액은 그대로 이어집니다.</p>
<a class="download" href="${downloadPath}" download="${filename}">Android APK 다운로드 · ${size} MB</a>
<p class="note">이전 버전이 설치되어 있다면 <strong>앱을 삭제하지 않고</strong> 새 APK를 열어 ‘업데이트’를 선택하세요. 같은 서명으로 기존 기록을 이어갑니다. 업데이트 전 설정에서 백업을 저장해 두세요.</p>
<p class="note">Android 7 이상과 최신 Android System WebView/Chrome이 필요해요. 가족이 사용하는 개인용 디버그 서명 APK입니다.</p>
<h2>설치 순서</h2><ol>
<li>PC와 Android 휴대폰을 같은 Wi-Fi에 연결하고 이 페이지를 휴대폰에서 여세요.</li>
<li>위 버튼으로 APK를 내려받은 뒤 다운로드한 파일을 여세요.</li>
<li>Android가 설치 권한을 요청하면 사용 중인 브라우저 또는 파일 앱의 ‘이 출처 허용’을 선택하고 설치하세요. 메뉴 이름은 기기마다 다를 수 있어요.</li>
<li>설치한 <strong>시몬치치</strong>를 열고 오늘 화면 맨 위에서 학습할 단어장을 선택하세요.</li>
<li>비행기 모드로 바꾸고 앱을 완전히 닫았다가 다시 열어 학습을 확인하세요. 설치가 끝나면 PC 다운로드 서버는 꺼도 돼요.</li>
</ol>
<p class="note">데이터는 이 앱 안에 저장돼요. 앱 삭제·데이터 지우기 전에 설정에서 학습 기록을 백업하세요. 이전 브라우저 학습 기록은 자동으로 옮겨지지 않아요.</p>
<h2>파일 확인</h2><p class="note">${filename} · ${apk.length.toLocaleString('ko-KR')}바이트<br>SHA-256</p>
<p class="hash">${sha256}</p><a href="/sha256.txt">체크섬 텍스트 받기</a>
</div><p class="note">이 페이지는 PC에서 잠시 여는 설치 파일 전달용 서버입니다. 접속 기록·쿠키·분석 도구를 사용하지 않습니다.</p></main></body></html>`;

function respond(response, status, type, body, method, extra = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    ...extra,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    respond(
      response,
      405,
      'text/plain; charset=utf-8',
      '허용되지 않는 요청입니다.\n',
      request.method,
      { Allow: 'GET, HEAD' },
    );
    return;
  }
  let pathname;
  try {
    pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    respond(response, 400, 'text/plain; charset=utf-8', '주소를 확인해 주세요.\n', request.method);
    return;
  }
  if (pathname === '/') {
    respond(response, 200, 'text/html; charset=utf-8', page, request.method);
  } else if (pathname === downloadPath) {
    respond(response, 200, 'application/vnd.android.package-archive', apk, request.method, {
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  } else if (pathname === '/sha256.txt') {
    respond(response, 200, 'text/plain; charset=utf-8', checksum, request.method);
  } else {
    respond(
      response,
      404,
      'text/plain; charset=utf-8',
      '파일이 없어요. 설치 페이지의 버튼을 사용해 주세요.\n',
      request.method,
    );
  }
});

server.on('error', (error) => {
  console.error(`설치 파일 서버를 열지 못했어요: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  console.info(`시몬치치 APK 다운로드 서버\nPC: http://localhost:${port}\nSHA-256: ${sha256}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.info(`같은 Wi-Fi의 Android에서: http://${address.address}:${port}`);
      }
    }
  }
  console.info('설치 후 Ctrl+C로 종료하세요. 이 서버는 앱 실행에 필요하지 않습니다.');
});
