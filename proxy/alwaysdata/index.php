<?php
/**
 * InkonabTV HTTPS relay for alwaysdata (PHP).
 *
 * Same job as ../worker.js: the website is HTTPS, the provider sends video over plain
 * HTTP, so this fetches it server-side and returns it over HTTPS with CORS headers.
 * It runs on alwaysdata because the provider's video server refuses Cloudflare.
 *
 * Usage:  https://<site>/relay/?url=<encoded stream URL>
 *
 * Only URLs on ALLOWED_HOSTS are accepted directly. URLs inside a playlist (the
 * provider's video server) are signed with a secret read from ~/relay-secret, so the
 * relay can't be used as an open proxy. Install: see README.md next to this file.
 */

const ALLOWED_HOSTS = ['inkonabtv.ottb.xyz'];
const MAX_REDIRECTS = 5;

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Range, Content-Type');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }

$secret = trim((string) @file_get_contents(getenv('HOME') . '/relay-secret'));
if (strlen($secret) < 16) { http_response_code(503); exit('Relay not set up: ~/relay-secret is missing.'); }

function sign_url(string $secret, string $value): string {
  return substr(hash_hmac('sha256', $value, $secret), 0, 32);
}

function self_base(): string {
  $path = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
  return 'https://' . $_SERVER['HTTP_HOST'] . $path;
}

$target = $_GET['url'] ?? '';
if ($target === '') exit('InkonabTV relay is running.');

$parts = parse_url($target);
if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) {
  http_response_code(400); exit('Bad url');
}
$allowed = in_array($parts['host'], ALLOWED_HOSTS, true)
  || hash_equals(sign_url($secret, $target), (string) ($_GET['sig'] ?? ''));
if (!$allowed) { http_response_code(403); exit('Host not allowed'); }

// Resolve a possibly relative URL against a base.
function absolute(string $u, string $base): string {
  if (preg_match('#^https?://#i', $u)) return $u;
  $b = parse_url($base);
  $root = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
  if (str_starts_with($u, '/')) return $root . $u;
  $dir = preg_replace('#/[^/]*$#', '/', $b['path'] ?? '/');
  return $root . $dir . $u;
}

// Follow redirects by hand so the final address is known (playlists are rewritten against it).
$range = $_SERVER['HTTP_RANGE'] ?? '';
$url = $target;
for ($i = 0; $i <= MAX_REDIRECTS; $i++) {
  $ch = curl_init($url);
  $respHeaders = [];
  curl_setopt_array($ch, [
    CURLOPT_NOBODY => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (InkonabTV Web)',
    CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$respHeaders) {
      if (strpos($h, ':') !== false) { [$k, $v] = explode(':', $h, 2); $respHeaders[strtolower(trim($k))] = trim($v); }
      return strlen($h);
    },
  ]);
  curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  if ($code >= 300 && $code < 400 && !empty($respHeaders['location'])) { $url = absolute($respHeaders['location'], $url); continue; }
  break;
}

$path = parse_url($url, PHP_URL_PATH) ?? '';
$isPlaylist = preg_match('#\.m3u8?$#i', $path) || preg_match('#\.m3u8?$#i', $parts['path'] ?? '');

if ($isPlaylist && $method === 'GET') {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 15,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (InkonabTV Web)']);
  $text = (string) curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $final = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $url;
  curl_close($ch);
  if ($code === 200 && str_starts_with(ltrim($text), '#EXTM3U')) {
    $wrap = function ($u) use ($final, $secret) {
      $abs = absolute($u, $final);
      return self_base() . '?url=' . rawurlencode($abs) . '&sig=' . sign_url($secret, $abs);
    };
    $out = [];
    foreach (preg_split('/\r?\n/', $text) as $line) {
      $l = trim($line);
      if ($l === '') { $out[] = $line; continue; }
      if ($l[0] === '#') {
        $out[] = preg_replace_callback('/URI="([^"]+)"/', fn($m) => 'URI="' . $wrap($m[1]) . '"', $l);
      } else {
        $out[] = $wrap($l);
      }
    }
    header('Content-Type: application/vnd.apple.mpegurl');
    header('Cache-Control: no-cache');
    exit(implode("\n", $out));
  }
  http_response_code($code ?: 502);
  exit($text);
}

// Video data: stream it through as it arrives, passing Range and the useful headers.
@set_time_limit(0);
while (ob_get_level()) ob_end_clean();
$ch = curl_init($url);
$sent = false;
curl_setopt_array($ch, [
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_USERAGENT => 'Mozilla/5.0 (InkonabTV Web)',
  CURLOPT_HTTPHEADER => $range ? ['Range: ' . $range] : [],
  CURLOPT_NOBODY => $method === 'HEAD',
  CURLOPT_HEADERFUNCTION => function ($c, $h) {
    if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) http_response_code((int) $m[1]);
    elseif (preg_match('/^(Content-Type|Content-Length|Content-Range|Accept-Ranges|Cache-Control):/i', $h)) header(trim($h));
    return strlen($h);
  },
  CURLOPT_WRITEFUNCTION => function ($c, $data) {
    echo $data; flush();
    return connection_aborted() ? 0 : strlen($data);
  },
]);
if (!curl_exec($ch) && !headers_sent()) { http_response_code(502); echo 'Relay could not reach the stream.'; }
curl_close($ch);
