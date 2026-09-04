<?php
/**
 * Kalaxa_Store — ذخیره‌سازی پاکت‌ها در جدول اختصاصی.
 * سرور envelope خام را دست‌نخورده نگه می‌دارد (امینِ داده)؛ ستون‌های جدا فقط برای
 * status/سیاست push هستند و از خود پاکت استخراج می‌شوند.
 */

if ( ! class_exists( 'Kalaxa_Store' ) ) {

	class Kalaxa_Store {

		public static function table() {
			global $wpdb;
			return $wpdb->prefix . 'kalaxa_projects';
		}

		public static function install() {
			global $wpdb;
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
			$table   = self::table();
			$charset = $wpdb->get_charset_collate();
			dbDelta( "CREATE TABLE {$table} (
				project_id CHAR(36) NOT NULL,
				revision BIGINT UNSIGNED NULL,
				checksum CHAR(64) NULL,
				schema_version SMALLINT UNSIGNED NOT NULL,
				device_id VARCHAR(191) NULL,
				updated_at VARCHAR(32) NULL,
				pushed_at DATETIME NOT NULL,
				pushed_by BIGINT UNSIGNED NOT NULL,
				envelope LONGTEXT NOT NULL,
				PRIMARY KEY  (project_id)
			) {$charset};" );
			add_option( 'kalaxa_sync_db_version', KALAXA_SYNC_VERSION );
		}

		/** @return array|null ['revision','checksum','schema_version','updated_at','device_id','pushed_at'] */
		public static function get_state( $project_id ) {
			global $wpdb;
			$row = $wpdb->get_row(
				$wpdb->prepare(
					'SELECT revision, checksum, schema_version, updated_at, device_id, pushed_at FROM ' .
					self::table() . ' WHERE project_id = %s',
					$project_id
				),
				ARRAY_A
			);
			if ( ! $row ) {
				return null;
			}
			$row['revision']       = null === $row['revision'] ? null : (int) $row['revision'];
			$row['schema_version'] = (int) $row['schema_version'];
			return $row;
		}

		/** @return string|null envelope خام. */
		public static function get_envelope( $project_id ) {
			global $wpdb;
			return $wpdb->get_var(
				$wpdb->prepare(
					'SELECT envelope FROM ' . self::table() . ' WHERE project_id = %s',
					$project_id
				)
			);
		}

		/**
		 * ذخیرهٔ اتمیک با compare-and-swap (رفع #2 — رِیس شرط):
		 * $expected_state باید همان چیزی باشد که caller با get_state() *بلافاصله پیش از*
		 * این فراخوانی خوانده و تصمیمش (accept/idempotent) را رویش بنا کرده — نه چیز دیگر.
		 *   - null یعنی «فکر می‌کنم هیچ ردیفی نیست» → INSERT؛ اگر رقیب زودتر رسیده باشد
		 *     (کلید اصلی تکراری)، insert() با false برمی‌گردد.
		 *   - آرایه یعنی «ردیف با این revision را دیدم» (خودِ revision هم می‌تواند null باشد —
		 *     ردیف میراثی بدون متادیتای sync) → UPDATE با تطبیق null-safe (<=>) روی همان
		 *     revision؛ نکتهٔ حیاتی: %d نمی‌تواند NULL تولید کند (به ۰ کست می‌شود)، پس برای
		 *     NULL باید literal «NULL» در SQL نوشته شود، نه placeholder.
		 * چون Push_Policy پیش از این تماس حالت idempotent (چک‌سام یکسان) را جدا می‌کند، هرچه
		 * به اینجا برسد واقعاً محتوایش فرق دارد — پس صفرشدنِ rows_affected در UPDATE فقط
		 * می‌تواند به‌خاطر رِیس واقعی باشد، نه «مقدار همان قبلی بود».
		 *
		 * @return true ذخیره شد | false برخورد رِیس (CAS شکست خورد) — نه خطای واقعی DB
		 */
		public static function save( $project_id, $raw, array $env, $user_id, $expected_state ) {
			global $wpdb;
			$table = self::table();
			$revision       = isset( $env['revision'] ) ? $env['revision'] : null;
			$checksum       = isset( $env['checksum'] ) ? $env['checksum'] : null;
			$schema_version = $env['schema_version'];
			$device_id      = isset( $env['device_id'] ) ? $env['device_id'] : null;
			$updated_at     = isset( $env['updated_at'] ) ? $env['updated_at'] : null;
			$pushed_at      = gmdate( 'Y-m-d H:i:s' );

			if ( null === $expected_state ) {
				$ok = $wpdb->insert( $table, array(
					'project_id'     => $project_id,
					'revision'       => $revision,
					'checksum'       => $checksum,
					'schema_version' => $schema_version,
					'device_id'      => $device_id,
					'updated_at'     => $updated_at,
					'pushed_at'      => $pushed_at,
					'pushed_by'      => (int) $user_id,
					'envelope'       => $raw,
				) );
				return false !== $ok;
			}

			$expected_revision = isset( $expected_state['revision'] ) ? $expected_state['revision'] : null;
			// شرط revision به‌صورت literal ساخته می‌شود چون %d برای NULL معادل ۰ می‌شود، نه NULL.
			$revision_clause = null === $expected_revision
				? 'revision IS NULL'
				: $wpdb->prepare( 'revision = %d', $expected_revision );

			$sql = $wpdb->prepare(
				"UPDATE {$table} SET revision = %d, checksum = %s, schema_version = %d, " .
				'device_id = %s, updated_at = %s, pushed_at = %s, pushed_by = %d, envelope = %s ' .
				"WHERE project_id = %s AND {$revision_clause}",
				$revision, $checksum, $schema_version, $device_id, $updated_at, $pushed_at,
				(int) $user_id, $raw, $project_id
			);
			$wpdb->query( $sql );
			return 1 === (int) $wpdb->rows_affected;
		}

		public static function list_projects() {
			global $wpdb;
			return $wpdb->get_results(
				'SELECT project_id, revision, checksum, schema_version, updated_at, pushed_at FROM ' .
				self::table() . ' ORDER BY pushed_at DESC LIMIT 200',
				ARRAY_A
			);
		}
	}
}
