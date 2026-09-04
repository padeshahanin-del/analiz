<?php
/**
 * Kalaxa_Envelope — اعتبارسنجی پاکت kalaxa-doc سمت سرور (بدون وابستگی وردپرس).
 * قرارداد سیم: docs/SYNC_ARCHITECTURE.md مخزن پلاگین.
 * سرور «نگه‌دارندهٔ امین» است: بدنهٔ doc را تفسیر نمی‌کند؛ فقط شکل پاکت، نسخهٔ schema،
 * صحت چک‌سام و متادیتای sync را می‌سنجد و envelope خام را ذخیره می‌کند.
 */

if ( ! class_exists( 'Kalaxa_Envelope' ) ) {

	class Kalaxa_Envelope {

		const FORMAT               = 'kalaxa-doc';
		const LEGACY_FORMATS       = array( 'kabinetyar-doc' );
		const MAX_SCHEMA_SUPPORTED = 3;   // هم‌گام با Migrations::CURRENT_VERSION پلاگین
		const MAX_BYTES            = 5242880; // 5MB — سند کابینت هرگز نزدیک این نیست

		/**
		 * @param string $raw بدنهٔ خام درخواست.
		 * @return array {ok: bool, envelope?: array, error?: {code,message}}
		 */
		public static function validate( $raw ) {
			if ( ! is_string( $raw ) || '' === $raw ) {
				return self::err( 'KX_SYNC_EMPTY', 'بدنهٔ درخواست خالی است' );
			}
			if ( strlen( $raw ) > self::MAX_BYTES ) {
				return self::err( 'KX_SYNC_TOO_LARGE', 'پاکت بزرگ‌تر از سقف مجاز است' );
			}

			$env = json_decode( $raw, true );
			if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $env ) ) {
				return self::err( 'KX_SYNC_JSON', 'JSON خراب است: ' . json_last_error_msg() );
			}

			$fmt = isset( $env['format'] ) ? $env['format'] : null;
			if ( self::FORMAT !== $fmt && ! in_array( $fmt, self::LEGACY_FORMATS, true ) ) {
				return self::err( 'KX_SYNC_FORMAT', 'قالب پاکت ناشناخته است' );
			}

			$ver = isset( $env['schema_version'] ) ? $env['schema_version'] : null;
			if ( ! is_int( $ver ) || $ver < 1 ) {
				return self::err( 'KX_SYNC_SCHEMA', 'schema_version نامعتبر است' );
			}
			if ( $ver > self::MAX_SCHEMA_SUPPORTED ) {
				return self::err(
					'KX_SYNC_SCHEMA_NEWER',
					'پاکت با schema جدیدتر از سرور است (v' . $ver . ' > v' . self::MAX_SCHEMA_SUPPORTED . ')'
				);
			}

			if ( ! isset( $env['doc'] ) || ! is_array( $env['doc'] ) ) {
				return self::err( 'KX_SYNC_DOC', 'بخش doc موجود نیست' );
			}

			// چک‌سام: از v2 اجباری (D-016 پلاگین)
			$stored = isset( $env['checksum'] ) ? $env['checksum'] : null;
			if ( null === $stored && $ver < 2 ) {
				// پاکت میراثی v1 — پذیرفته، بدون تأیید چک‌سام
			} else {
				if ( ! is_string( $stored ) || ! preg_match( '/^[0-9a-f]{64}$/', $stored ) ) {
					return self::err( 'KX_SYNC_CHECKSUM', 'checksum پاکت نامعتبر است' );
				}
				// دیکد شیءمحور همان raw برای حفظ {} (نکتهٔ ثبت‌شده در Kalaxa_Canonical)
				$env_obj = json_decode( $raw );
				if ( ! is_object( $env_obj ) || ! isset( $env_obj->doc ) ) {
					return self::err( 'KX_SYNC_DOC', 'بخش doc موجود نیست' );
				}
				try {
					$actual = Kalaxa_Canonical::checksum( $env_obj->doc );
				} catch ( InvalidArgumentException $e ) {
					return self::err( 'KX_SYNC_CANONICAL', 'سند قابل متعارف‌سازی نیست: ' . $e->getMessage() );
				}
				if ( $actual !== $stored ) {
					return self::err( 'KX_SYNC_CHECKSUM_MISMATCH', 'چک‌سام با محتوای doc نمی‌خواند' );
				}
			}

			// متادیتای sync — اختیاری، اما اگر بود باید معتبر باشد
			if ( isset( $env['revision'] ) && ( ! is_int( $env['revision'] ) || $env['revision'] < 1 ) ) {
				return self::err( 'KX_SYNC_REVISION', 'revision باید Integer مثبت باشد' );
			}
			if ( isset( $env['updated_at'] ) && ! is_string( $env['updated_at'] ) ) {
				return self::err( 'KX_SYNC_UPDATED_AT', 'updated_at باید رشتهٔ ISO 8601 باشد' );
			}
			if ( isset( $env['device_id'] ) && ( ! is_string( $env['device_id'] ) || '' === $env['device_id'] ) ) {
				return self::err( 'KX_SYNC_DEVICE', 'device_id باید رشتهٔ ناتهی باشد' );
			}

			return array( 'ok' => true, 'envelope' => $env );
		}

		/** شناسهٔ پروژه از بدنه: project.id (UUID). */
		public static function project_id( array $env ) {
			$id = isset( $env['doc']['project']['id'] ) ? $env['doc']['project']['id'] : null;
			if ( is_string( $id ) &&
				preg_match( '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id ) ) {
				return $id;
			}
			return null;
		}

		private static function err( $code, $message ) {
			return array(
				'ok'    => false,
				'error' => array( 'code' => $code, 'message' => $message ),
			);
		}
	}
}
