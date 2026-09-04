<?php
/**
 * bin/selftest.php — راستی‌آزمای CLI (بدون وردپرس): php bin/selftest.php
 * ۱) پورت PHP فرم متعارف/چک‌سام باید با فایل طلایی مخزن پلاگین (Ruby/Python) هم‌نظر باشد.
 * ۲) اعتبارسنجی پاکت و سیاست push روی حالت‌های مرزی.
 * خروجی: PASS/FAIL هر مورد + RESULT نهایی؛ exit code غیرصفر روی شکست.
 */

require __DIR__ . '/../includes/class-kalaxa-canonical.php';
require __DIR__ . '/../includes/class-kalaxa-envelope.php';
require __DIR__ . '/../includes/class-kalaxa-push-policy.php';
require __DIR__ . '/../includes/class-kalaxa-share.php';

$failures = 0;
function check( $name, $cond, $detail = '' ) {
	global $failures;
	echo ( $cond ? 'PASS  ' : 'FAIL  ' ) . $name . ( ! $cond && $detail ? "  [$detail]" : '' ) . "\n";
	if ( ! $cond ) { $failures++; }
}

$fx       = __DIR__ . '/../tests/fixtures/';
$gold_raw = file_get_contents( $fx . 'doc_v2_expected.json' );
$golden   = json_decode( $gold_raw ); // شیءمحور — {} حفظ می‌شود (نکتهٔ Kalaxa_Canonical)
$golden_a = json_decode( $gold_raw, true ); // برای دسترسی فیلدها در پاکت‌سازی
$goldsum  = trim( file_get_contents( $fx . 'doc_v2_checksum.txt' ) );

// --- ۱) فرم متعارف / چک‌سام (سه‌پیاده‌سازی هم‌نظر) ---
check( 'چک‌سام طلایی در PHP بازتولید می‌شود', Kalaxa_Canonical::checksum( $golden ) === $goldsum,
	Kalaxa_Canonical::checksum( $golden ) );

check( 'چک‌سام مستقل از ترتیب کلیدهاست',
	Kalaxa_Canonical::canonical( json_decode( '{"b":1,"a":{"y":[],"x":{}}}' ) ) ===
	Kalaxa_Canonical::canonical( json_decode( '{"a":{"x":{},"y":[]},"b":1}' ) ) );

check( 'تمایز آبجکت خالی و آرایهٔ خالی حفظ می‌شود',
	Kalaxa_Canonical::canonical( json_decode( '{"p":{}}' ) ) === '{"p":{}}' &&
	Kalaxa_Canonical::canonical( json_decode( '{"p":[]}' ) ) === '{"p":[]}' );

$tampered = json_decode( $gold_raw );
$tampered->project->name .= 'x';
check( 'دستکاری چک‌سام را تغییر می‌دهد', Kalaxa_Canonical::checksum( $tampered ) !== $goldsum );

$float_doc = json_decode( $gold_raw );
$float_doc->entities->parts[0]->length_mm = 12.5;
$threw = false;
try { Kalaxa_Canonical::checksum( $float_doc ); } catch ( InvalidArgumentException $e ) { $threw = true; }
check( 'float در سند رد می‌شود (D-002)', $threw );

check( 'یونیکد فارسی بدون \\u escape', false === strpos( Kalaxa_Canonical::canonical( $golden ), '\\u06' ) );

// --- ۲) اعتبارسنجی پاکت ---
// پاکت را با «الحاق رشتهٔ خام سند» می‌سازیم، نه بازسریال‌سازی — تا {} داخل سند حفظ بماند
// (بازسریال‌سازی از assoc همان دام {}→[] را دارد که Canonical مستند کرده است).
function mk_env( $gold_raw, $goldsum, $overrides = array() ) {
	$o = array_merge( array(
		'format' => '"kalaxa-doc"', 'schema_version' => '3', 'checksum' => '"' . $goldsum . '"',
		'revision' => '3', 'updated_at' => '"2026-07-23T08:00:00Z"', 'device_id' => '"sketchup-test"',
	), $overrides );
	return '{"format":' . $o['format'] . ',"schema_version":' . $o['schema_version'] .
		',"checksum":' . $o['checksum'] . ',"doc":' . $gold_raw .
		',"revision":' . $o['revision'] . ',"updated_at":' . $o['updated_at'] .
		',"device_id":' . $o['device_id'] . '}';
}
$raw = mk_env( $gold_raw, $goldsum );

$v = Kalaxa_Envelope::validate( $raw );
check( 'پاکت معتبر پذیرفته می‌شود', $v['ok'], $v['ok'] ? '' : $v['error']['code'] );
check( 'project.id استخراج می‌شود', null !== Kalaxa_Envelope::project_id( $v['envelope'] ) );

$v2 = Kalaxa_Envelope::validate( mk_env( $gold_raw, $goldsum, array( 'checksum' => '"' . str_repeat( 'a', 64 ) . '"' ) ) );
check( 'چک‌سام ناهم‌خوان رد (MISMATCH)', ! $v2['ok'] && 'KX_SYNC_CHECKSUM_MISMATCH' === $v2['error']['code'] );

$v3 = Kalaxa_Envelope::validate( mk_env( $gold_raw, $goldsum, array( 'schema_version' => '4' ) ) );
check( 'schema جدیدتر رد (NEWER)', ! $v3['ok'] && 'KX_SYNC_SCHEMA_NEWER' === $v3['error']['code'] );

$v4 = Kalaxa_Envelope::validate( mk_env( $gold_raw, $goldsum, array( 'format' => '"other"' ) ) );
check( 'format ناشناخته رد', ! $v4['ok'] && 'KX_SYNC_FORMAT' === $v4['error']['code'] );

$v5 = Kalaxa_Envelope::validate( mk_env( $gold_raw, $goldsum, array( 'revision' => '0' ) ) );
check( 'revision صفر رد', ! $v5['ok'] && 'KX_SYNC_REVISION' === $v5['error']['code'] );

$v6 = Kalaxa_Envelope::validate( '' );
check( 'بدنهٔ خالی رد', ! $v6['ok'] && 'KX_SYNC_EMPTY' === $v6['error']['code'] );

// پاکت میراثی v1 بدون checksum پذیرفته می‌شود (D-016)
$v7 = Kalaxa_Envelope::validate( '{"format":"kabinetyar-doc","schema_version":1,"doc":' . $gold_raw . '}' );
check( 'پاکت میراثی v1 بدون چک‌سام پذیرفته', $v7['ok'], $v7['ok'] ? '' : $v7['error']['code'] );

// --- ۳) سیاست push (D-SYNC-2) ---
$st = array( 'revision' => 5, 'checksum' => 'aaaa' );
check( 'اولین push → accept',
	Kalaxa_Push_Policy::ACCEPT === Kalaxa_Push_Policy::decide( null, array( 'revision' => 1, 'checksum' => 'x' ) )['decision'] );
check( 'محتوای یکسان → idempotent',
	Kalaxa_Push_Policy::IDEMPOTENT === Kalaxa_Push_Policy::decide( $st, array( 'revision' => 9, 'checksum' => 'aaaa' ) )['decision'] );
check( 'revision جلوتر → accept',
	Kalaxa_Push_Policy::ACCEPT === Kalaxa_Push_Policy::decide( $st, array( 'revision' => 6, 'checksum' => 'bbbb' ) )['decision'] );
check( 'revision برابر + محتوای متفاوت → conflict',
	Kalaxa_Push_Policy::CONFLICT === Kalaxa_Push_Policy::decide( $st, array( 'revision' => 5, 'checksum' => 'bbbb' ) )['decision'] );
check( 'revision عقب‌تر → conflict',
	Kalaxa_Push_Policy::CONFLICT === Kalaxa_Push_Policy::decide( $st, array( 'revision' => 4, 'checksum' => 'bbbb' ) )['decision'] );
check( 'بدون revision روی سرور پُر → conflict',
	Kalaxa_Push_Policy::CONFLICT === Kalaxa_Push_Policy::decide( $st, array( 'revision' => null, 'checksum' => 'bbbb' ) )['decision'] );

// --- ۴) لینک اشتراک (منطق خالص) ---
$t1 = Kalaxa_Share::generate_token();
$t2 = Kalaxa_Share::generate_token();
check( 'توکن ۴۳نویسه base64url و یکتا', Kalaxa_Share::token_format_ok( $t1 ) && $t1 !== $t2 );
check( 'فرمت نامعتبر رد می‌شود',
	! Kalaxa_Share::token_format_ok( substr( $t1, 0, 42 ) ) &&
	! Kalaxa_Share::token_format_ok( $t1 . 'x' ) &&
	! Kalaxa_Share::token_format_ok( str_replace( substr( $t1, 5, 1 ), '+', $t1 ) ) );
check( 'hash توکن ۶۴ هگز و پایدار',
	1 === preg_match( '/^[0-9a-f]{64}$/', Kalaxa_Share::hash_token( $t1 ) ) &&
	Kalaxa_Share::hash_token( $t1 ) === Kalaxa_Share::hash_token( $t1 ) );
$now = time();
check( 'ردیف بدون انقضا فعال است',
	Kalaxa_Share::row_active( array( 'revoked' => 0, 'expires_at' => null ), $now ) );
check( 'ردیف باطل‌شده غیرفعال است',
	! Kalaxa_Share::row_active( array( 'revoked' => 1, 'expires_at' => null ), $now ) );
$future = gmdate( 'Y-m-d H:i:s', $now + 3600 );
$past   = gmdate( 'Y-m-d H:i:s', $now - 3600 );
check( 'انقضای آینده فعال، گذشته غیرفعال',
	Kalaxa_Share::row_active( array( 'revoked' => 0, 'expires_at' => $future ), $now ) &&
	! Kalaxa_Share::row_active( array( 'revoked' => 0, 'expires_at' => $past ), $now ) );
check( 'دقیقاً لحظهٔ انقضا غیرفعال است',
	! Kalaxa_Share::row_active( array( 'revoked' => 0, 'expires_at' => gmdate( 'Y-m-d H:i:s', $now ) ), $now ) );

// --- ۵) رگرسیون: مسیر واقعی pull()/share_envelope() نباید {} را به [] بشکند ---
// (باگ یافته‌شده در ممیزی: json_decode($raw, true) + بازسریال‌سازی WP، آبجکت خالی
// params یک یونیت را [] می‌کرد و چک‌سام پاکت را باطل می‌کرد — نمونهٔ Pull واقعی
// روی سند طلایی همین امروز این را نشان داد.)
function kx_wp_json_encode_stub( $v ) { return json_encode( $v, JSON_UNESCAPED_UNICODE ); }

check( 'سند طلایی واقعاً حاوی آبجکت خالی است (پیش‌شرط این تست)',
	'{}' === Kalaxa_Canonical::canonical( $golden->entities->units[0]->params ) );

$roundtrip = json_decode( kx_wp_json_encode_stub( json_decode( $raw ) ) );
check( 'دیکد شیءمحور + بازسریال‌سازی: params همچنان {} است (نه [])',
	'{}' === Kalaxa_Canonical::canonical( $roundtrip->doc->entities->units[0]->params ) );
check( 'چک‌سام پس از شبیه‌سازی مسیر pull هنوز معتبر است',
	Kalaxa_Canonical::checksum( $roundtrip->doc ) === $roundtrip->checksum );

echo str_repeat( '-', 40 ) . "\n";
echo $failures ? "RESULT: {$failures} FAILURE(S)\n" : "RESULT: ALL PASS\n";
exit( $failures ? 1 : 0 );
