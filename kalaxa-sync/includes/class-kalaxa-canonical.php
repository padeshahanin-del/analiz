<?php
/**
 * Kalaxa_Canonical — پورت PHP «فرم متعارف JSON + چک‌سام» (سومین پیاده‌سازی مستقل؛
 * مرجع: kalaxa/persistence/canonical.rb و tools/verify_data_spec.py در مخزن پلاگین).
 *
 * قواعد (باید بایت‌به‌بایت با Ruby/Python هم‌نظر باشد):
 *  - Object: کلیدها به ترتیب بایتی (strcmp) صعودی؛ {"k":v,...} بدون فاصله.
 *  - Array: [v,...] بدون فاصله، ترتیب حفظ می‌شود.
 *  - اسکالر: JSON استاندارد؛ یونیکد خام (بدون \uXXXX)، اسلش بدون escape.
 *  - float در سند ممنوع (D-002: طول‌ها Integer mm) → استثنا.
 *  - checksum = sha256(canonical(doc)) hex.
 *
 * بدون وابستگی به وردپرس — قابل اجرا در CLI برای self-test.
 */

if ( ! class_exists( 'Kalaxa_Canonical' ) ) {

	class Kalaxa_Canonical {

		/**
		 * @param mixed $value خروجی json_decode($raw) «بدون assoc» — آبجکت‌ها stdClass.
		 *        دلیل: json_decode($raw, true) آبجکت خالی {} را به [] فرومی‌کاهد و
		 *        چک‌سام را می‌شکند؛ با stdClass، {} حفظ می‌شود. آرایهٔ assoc هم برای
		 *        سازگاری پذیرفته و «آبجکت» حساب می‌شود.
		 * @return string فرم متعارف.
		 * @throws InvalidArgumentException روی float یا نوع ناشناخته.
		 */
		public static function canonical( $value ) {
			if ( $value instanceof stdClass ) {
				$value = get_object_vars( $value );
				$keys  = array_keys( $value );
				usort( $keys, 'strcmp' );
				$parts = array();
				foreach ( $keys as $k ) {
					$parts[] = self::encode_scalar( (string) $k ) . ':' . self::canonical( $value[ $k ] );
				}
				return '{' . implode( ',', $parts ) . '}';
			}
			if ( is_array( $value ) ) {
				if ( self::is_assoc( $value ) ) {
					$keys = array_keys( $value );
					foreach ( $keys as $k ) {
						if ( ! is_string( $k ) ) {
							throw new InvalidArgumentException( 'non-string key' );
						}
					}
					usort( $keys, 'strcmp' ); // ترتیب بایتی — هم‌ارز sorted() پایتون و sort روبی
					$parts = array();
					foreach ( $keys as $k ) {
						$parts[] = self::encode_scalar( $k ) . ':' . self::canonical( $value[ $k ] );
					}
					return '{' . implode( ',', $parts ) . '}';
				}
				$parts = array();
				foreach ( $value as $v ) {
					$parts[] = self::canonical( $v );
				}
				return '[' . implode( ',', $parts ) . ']';
			}
			if ( is_float( $value ) ) {
				throw new InvalidArgumentException( 'float forbidden in document' );
			}
			return self::encode_scalar( $value );
		}

		public static function checksum( $value ) {
			return hash( 'sha256', self::canonical( $value ) );
		}

		/** آرایهٔ PHP: خالی یا کلیدهای 0..n-1 = لیست؛ وگرنه آبجکت.
		 *  (مسیر اصلی چک‌سام از stdClass می‌گذرد؛ این شاخه فقط سازگاری است.) */
		private static function is_assoc( array $a ) {
			if ( array() === $a ) {
				return false; // خالی = []
			}
			return array_keys( $a ) !== range( 0, count( $a ) - 1 );
		}

		private static function encode_scalar( $v ) {
			$json = json_encode( $v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
			if ( false === $json ) {
				throw new InvalidArgumentException( 'unencodable scalar' );
			}
			return $json;
		}
	}
}
