<?php
/**
 * Kalaxa_Admin — صفحهٔ «نمایشگر» read-only داخل پیشخوان وردپرس (D-SYNC-4، فاز کلاینت وب).
 * هم-مبدأ با REST → بدون CORS و بدون اپ‌پسورد در مرورگر؛ احراز هویت = سشن وردپرس +
 * توانایی kalaxa_sync_read. همهٔ رندر سمت مرورگر با همان موتورهای UMD انجام می‌شود؛
 * سرور همچنان فقط امینِ پاکت است.
 */

if ( ! class_exists( 'Kalaxa_Admin' ) ) {

	class Kalaxa_Admin {

		public static function register() {
			add_menu_page(
				'Kalaxa Viewer',
				'Kalaxa Viewer',
				KALAXA_SYNC_CAP_READ,
				'kalaxa-viewer',
				array( __CLASS__, 'render_page' ),
				'dashicons-visibility',
				58
			);
			add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		}

		public static function enqueue( $hook ) {
			if ( 'toplevel_page_kalaxa-viewer' !== $hook ) {
				return;
			}
			$base = plugin_dir_url( dirname( __FILE__ ) ) . 'assets/';
			$ver  = KALAXA_SYNC_VERSION;
			// ترتیب مهم است: موتورها → هسته → چسب صفحه
			$engines = array( 'kalaxa-doc-adapter', 'kalaxa-schema', 'kalaxa-nesting',
				'kalaxa-nesting-validator', 'kalaxa-cutmap-svg', 'kalaxa-install-map',
				'kalaxa-report', 'kalaxa-hardware', 'kalaxa-placement' );
			$deps = array();
			foreach ( $engines as $e ) {
				wp_enqueue_script( "kalaxa-$e", $base . "engines/$e.js", $deps, $ver, true );
				$deps = array( "kalaxa-$e" );
			}
			wp_enqueue_script( 'kalaxa-viewer-core', $base . 'viewer-core.js', $deps, $ver, true );
			wp_enqueue_script( 'kalaxa-viewer', $base . 'viewer.js',
				array( 'kalaxa-viewer-core' ), $ver, true );
			wp_localize_script( 'kalaxa-viewer', 'KalaxaViewerCfg', array(
				'rest'  => esc_url_raw( rest_url( 'kalaxa-sync/v1/' ) ),
				'nonce' => wp_create_nonce( 'wp_rest' ),
			) );
			wp_enqueue_style( 'kalaxa-viewer', $base . 'viewer.css', array(), $ver );
		}

		public static function render_page() {
			echo '<div class="wrap" dir="rtl" id="kalaxa-viewer-app">' .
				'<h1>Kalaxa Viewer <small id="kx-meta"></small></h1>' .
				'<p><select id="kx-projects"><option value="">— انتخاب پروژه —</option></select> ' .
				'<button class="button" id="kx-reload">بازخوانی فهرست</button> ' .
				'<span id="kx-status"></span></p>' .
				'<div id="kx-msgs"></div><div id="kx-sections"></div></div>';
		}
	}
}
