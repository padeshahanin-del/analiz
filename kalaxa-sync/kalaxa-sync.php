<?php
/**
 * Plugin Name: Kalaxa Sync
 * Description: نقطهٔ همگام‌سازی پاکت‌های kalaxa-doc برای پلاگین اسکچاپ و کلاینت‌های read-only (D-SYNC-4).
 * Version: 0.4.0
 * Author: Kalaxa
 * Requires PHP: 7.4
 * Text Domain: kalaxa-sync
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KALAXA_SYNC_VERSION', '0.4.0' );
define( 'KALAXA_SYNC_CAP_WRITE', 'kalaxa_sync_write' ); // push
define( 'KALAXA_SYNC_CAP_READ', 'kalaxa_sync_read' );   // pull/status — کلاینت‌های read-only

require_once __DIR__ . '/includes/class-kalaxa-canonical.php';
require_once __DIR__ . '/includes/class-kalaxa-envelope.php';
require_once __DIR__ . '/includes/class-kalaxa-push-policy.php';
require_once __DIR__ . '/includes/class-kalaxa-store.php';
require_once __DIR__ . '/includes/class-kalaxa-rest.php';
require_once __DIR__ . '/includes/class-kalaxa-admin.php';
require_once __DIR__ . '/includes/class-kalaxa-share.php';

register_activation_hook( __FILE__, array( 'Kalaxa_Store', 'install' ) );
register_activation_hook( __FILE__, array( 'Kalaxa_Share', 'install' ) );

// ارتقای بی‌دردسر: اگر نسخهٔ DB عقب است، dbDelta ها را دوباره اجرا کن (idempotent)
add_action( 'plugins_loaded', function () {
	if ( get_option( 'kalaxa_sync_db_version' ) !== KALAXA_SYNC_VERSION ) {
		Kalaxa_Store::install();
		Kalaxa_Share::install();
		update_option( 'kalaxa_sync_db_version', KALAXA_SYNC_VERSION );
	}
} );

add_action( 'template_redirect', array( 'Kalaxa_Share', 'maybe_render_public_page' ) );

// نقش‌ها: admin هر دو توانایی؛ نقش سفارشی «kalaxa_device» فقط از راه کد/افزونهٔ نقش‌ها بدهید.
add_action( 'init', function () {
	$admin = get_role( 'administrator' );
	if ( $admin ) {
		$admin->add_cap( KALAXA_SYNC_CAP_WRITE );
		$admin->add_cap( KALAXA_SYNC_CAP_READ );
	}
} );

add_action( 'rest_api_init', array( 'Kalaxa_Rest', 'register_routes' ) );
add_action( 'admin_menu', array( 'Kalaxa_Admin', 'register' ) );
