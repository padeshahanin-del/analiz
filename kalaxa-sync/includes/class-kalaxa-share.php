<?php
/**
 * Kalaxa_Share — لینک اشتراک عمومی امضادار برای نمایش فقط‌خواندنی یک پروژه
 * بدون لاگین (فرستادن نقشه/گزارش به مشتری).
 *
 * مدل امنیتی:
 *  - توکن ۲۵۶ بیتی تصادفی (base64url، ۴۳ نویسه) فقط «یک بار» هنگام ساخت نمایش داده
 *    می‌شود؛ در پایگاه داده فقط sha256 آن نگه‌داری می‌شود (افشای DB ⇒ افشای لینک نمی‌شود).
 *  - مقایسه با hash_equals (زمان-ثابت)؛ انقضای پیش‌فرض ۳۰ روز؛ ابطال تکی/سراسری پروژه.
 *  - سطح دسترسی لینک: فقط خواندن همان یک پروژه — نه فهرست، نه push.
 *  - هشدار ذاتی: هرکس لینک را داشته باشد می‌بیند؛ در راهنما مستند شده است.
 *
 * منطق «خالص» (بدون $wpdb) برای CLI-test جدا شده: hash_token / token_format_ok /
 * row_active — در bin/selftest.php پوشش داده می‌شوند.
 */

if ( ! class_exists( 'Kalaxa_Share' ) ) {

	class Kalaxa_Share {

		const TOKEN_BYTES  = 32;   // ۲۵۶ بیت
		const DEFAULT_DAYS = 30;

		/* ---------------- منطق خالص (CLI-testable) ---------------- */

		public static function generate_token() {
			// base64url بدون padding → ۴۳ نویسهٔ [A-Za-z0-9_-]
			return rtrim( strtr( base64_encode( random_bytes( self::TOKEN_BYTES ) ), '+/', '-_' ), '=' );
		}

		public static function token_format_ok( $token ) {
			return is_string( $token ) && 1 === preg_match( '/^[A-Za-z0-9_-]{43}$/', $token );
		}

		public static function hash_token( $token ) {
			return hash( 'sha256', $token );
		}

		/**
		 * فعال‌بودن یک ردیف اشتراک در لحظهٔ $now_ts (زمان‌سنجی UTC).
		 * @param array $row ['revoked'=>0|1, 'expires_at'=>'Y-m-d H:i:s'|null]
		 */
		public static function row_active( array $row, $now_ts ) {
			if ( ! empty( $row['revoked'] ) ) {
				return false;
			}
			if ( empty( $row['expires_at'] ) ) {
				return true; // بدون انقضا (days=0 هنگام ساخت)
			}
			$exp = strtotime( $row['expires_at'] . ' UTC' );
			return false !== $exp && $now_ts < $exp;
		}

		/* ---------------- ذخیره‌سازی ---------------- */

		public static function table() {
			global $wpdb;
			return $wpdb->prefix . 'kalaxa_shares';
		}

		public static function install() {
			global $wpdb;
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
			dbDelta( 'CREATE TABLE ' . self::table() . " (
				token_hash CHAR(64) NOT NULL,
				project_id CHAR(36) NOT NULL,
				created_by BIGINT UNSIGNED NOT NULL,
				created_at DATETIME NOT NULL,
				expires_at DATETIME NULL,
				revoked TINYINT(1) NOT NULL DEFAULT 0,
				PRIMARY KEY  (token_hash),
				KEY project_id (project_id)
			) " . $wpdb->get_charset_collate() . ';' );
		}

		/** @return array{token,url,expires_at:string|null}|null — null یعنی درج در DB شکست خورد
		 *  (پیش از این رفع، تابع حتی روی شکست insert یک توکن/URL معتبرنما برمی‌گرداند که در
		 *  اولین استفاده ۴۰۴ می‌داد — چون خودِ ردیف اصلاً در DB نبود). */
		public static function create( $project_id, $days, $user_id ) {
			global $wpdb;
			$days  = max( 0, (int) $days );
			$token = self::generate_token();
			$exp   = $days > 0 ? gmdate( 'Y-m-d H:i:s', time() + $days * DAY_IN_SECONDS ) : null;
			$ok    = $wpdb->insert( self::table(), array(
				'token_hash' => self::hash_token( $token ),
				'project_id' => $project_id,
				'created_by' => (int) $user_id,
				'created_at' => gmdate( 'Y-m-d H:i:s' ),
				'expires_at' => $exp,
				'revoked'    => 0,
			) );
			if ( false === $ok ) {
				return null;
			}
			return array(
				'token'      => $token,
				'url'        => home_url( '/?kalaxa_share=' . $token ),
				'expires_at' => $exp,
			);
		}


		/** @return string|null project_id در صورت اعتبار توکن. */
		public static function resolve( $token ) {
			if ( ! self::token_format_ok( $token ) ) {
				return null;
			}
			global $wpdb;
			$row = $wpdb->get_row(
				$wpdb->prepare(
					'SELECT token_hash, project_id, expires_at, revoked FROM ' . self::table() .
					' WHERE token_hash = %s',
					self::hash_token( $token )
				),
				ARRAY_A
			);
			if ( ! $row || ! hash_equals( $row['token_hash'], self::hash_token( $token ) ) ) {
				return null;
			}
			return self::row_active( $row, time() ) ? $row['project_id'] : null;
		}

		public static function list_for_project( $project_id ) {
			global $wpdb;
			return $wpdb->get_results(
				$wpdb->prepare(
					'SELECT token_hash, created_at, expires_at, revoked FROM ' . self::table() .
					' WHERE project_id = %s ORDER BY created_at DESC',
					$project_id
				),
				ARRAY_A
			);
		}

		public static function revoke( $token_hash ) {
			global $wpdb;
			return false !== $wpdb->update( self::table(),
				array( 'revoked' => 1 ), array( 'token_hash' => $token_hash ) );
		}

		/* ---------------- صفحهٔ عمومی ---------------- */

		/** hook: template_redirect — بدون rewrite؛ ?kalaxa_share=<token> */
		public static function maybe_render_public_page() {
			if ( ! isset( $_GET['kalaxa_share'] ) ) {
				return;
			}
			$token = sanitize_text_field( wp_unslash( $_GET['kalaxa_share'] ) );
			$pid   = self::resolve( $token );
			status_header( $pid ? 200 : 404 );
			nocache_headers();
			header( 'Content-Type: text/html; charset=utf-8' );
			header( 'X-Robots-Tag: noindex, nofollow' );
			$base = plugin_dir_url( dirname( __FILE__ ) ) . 'assets/';
			echo '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' .
				'<meta name="viewport" content="width=device-width, initial-scale=1">' .
				'<meta name="robots" content="noindex,nofollow">' .
				'<title>Kalaxa — نمایش پروژه</title>' .
				'<link rel="stylesheet" href="' . esc_url( $base . 'viewer.css' ) . '?v=' . KALAXA_SYNC_VERSION . '">' .
				'</head><body><div id="kalaxa-viewer-app" style="max-width:1000px;margin:24px auto;padding:0 16px">' .
				'<h1 style="color:#8a5a2b">Kalaxa <small id="kx-meta"></small></h1>' .
				'<div id="kx-msgs"></div><div id="kx-sections"></div></div>';
			if ( $pid ) {
				$engines = array( 'kalaxa-doc-adapter', 'kalaxa-schema', 'kalaxa-nesting',
					'kalaxa-nesting-validator', 'kalaxa-cutmap-svg', 'kalaxa-install-map',
					'kalaxa-report', 'kalaxa-hardware', 'kalaxa-placement' );
				foreach ( $engines as $e ) {
					echo '<script src="' . esc_url( $base . 'engines/' . $e . '.js' ) . '?v=' . KALAXA_SYNC_VERSION . '"></script>';
				}
				echo '<script src="' . esc_url( $base . 'viewer-core.js' ) . '?v=' . KALAXA_SYNC_VERSION . '"></script>' .
					'<script>window.KalaxaShareCfg=' . wp_json_encode( array(
						'endpoint' => esc_url_raw( rest_url( 'kalaxa-sync/v1/share/' . rawurlencode( $token ) . '/envelope' ) ),
					) ) . ';</script>' .
					'<script src="' . esc_url( $base . 'viewer-public.js' ) . '?v=' . KALAXA_SYNC_VERSION . '"></script>';
			} else {
				echo '<div class="kx-msg err">لینک اشتراک نامعتبر، باطل‌شده یا منقضی است.</div>';
			}
			echo '</body></html>';
			exit;
		}
	}
}
