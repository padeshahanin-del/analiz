<?php
/**
 * Kalaxa_Push_Policy — تصمیم پذیرش push (D-SYNC-2)، جدا از IO تا در CLI تست شود.
 * قاعده: last-write-wins «سمت کلاینت با هشدار»؛ سرور فقط واگرایی را گزارش می‌کند.
 *
 * حالت‌ها (state = ردیف موجود سرور یا null):
 *  - state=null                          → accept (اولین push)
 *  - checksum یکسان                      → idempotent (200، بدون نوشتن)
 *  - incoming.revision >  state.revision → accept (پیش‌روی عادی)
 *  - incoming.revision == state.revision → conflict 409 (دو مبدأ از یک نقطه واگرا شده‌اند)
 *  - incoming.revision <  state.revision → conflict 409 (کلاینت عقب است؛ اول pull کند)
 *  - پاکت بدون revision                  → فقط وقتی سرور خالی است accept؛ وگرنه conflict
 *    (کلاینت قدیمیِ بدون sync حق بازنویسی نسخهٔ ردگیری‌شده را ندارد)
 */

if ( ! class_exists( 'Kalaxa_Push_Policy' ) ) {

	class Kalaxa_Push_Policy {

		const ACCEPT     = 'accept';
		const IDEMPOTENT = 'idempotent';
		const CONFLICT   = 'conflict';

		/**
		 * @param array|null $state    ['revision'=>int|null,'checksum'=>string|null]
		 * @param array      $incoming ['revision'=>int|null,'checksum'=>string|null]
		 * @return array {decision, reason_fa}
		 */
		public static function decide( $state, array $incoming ) {
			if ( null === $state ) {
				return self::out( self::ACCEPT, 'اولین نسخهٔ پروژه' );
			}

			$in_ck = isset( $incoming['checksum'] ) ? $incoming['checksum'] : null;
			if ( null !== $in_ck && $in_ck === $state['checksum'] ) {
				return self::out( self::IDEMPOTENT, 'محتوای یکسان — نیازی به نوشتن نیست' );
			}

			$in_rev = isset( $incoming['revision'] ) ? $incoming['revision'] : null;
			$st_rev = isset( $state['revision'] ) ? $state['revision'] : null;

			if ( null === $in_rev ) {
				return self::out( self::CONFLICT, 'پاکت بدون revision نمی‌تواند نسخهٔ ردگیری‌شده را بازنویسی کند — ابتدا pull کنید' );
			}
			if ( null === $st_rev || $in_rev > $st_rev ) {
				return self::out( self::ACCEPT, 'revision جلوتر از سرور' );
			}
			if ( $in_rev === $st_rev ) {
				return self::out( self::CONFLICT, 'واگرایی: revision یکسان اما محتوای متفاوت — انتخاب نسخه با کاربر' );
			}
			return self::out( self::CONFLICT, 'کلاینت عقب‌تر از سرور است — ابتدا pull کنید' );
		}

		private static function out( $decision, $reason ) {
			return array( 'decision' => $decision, 'reason_fa' => $reason );
		}
	}
}
