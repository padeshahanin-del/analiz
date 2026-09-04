<?php
/**
 * Kalaxa_Rest — مسیرهای REST (namespace: kalaxa-sync/v1).
 * احراز هویت: Application Passwords وردپرس (Basic) + توانایی‌ها:
 *   GET  /projects            (READ)  فهرست پروژه‌ها (متادیتا)
 *   GET  /projects/{id}/status(READ)  {revision, checksum, schema_version, ...}
 *   GET  /projects/{id}       (READ)  pull — envelope خام
 *   POST /projects/{id}       (WRITE) push — بدنه = envelope خام؛ 409 روی واگرایی
 * پاسخ خطا: { ok:false, error:{code,message} } — هم‌خانوادهٔ error envelope پلاگین.
 */

if ( ! class_exists( 'Kalaxa_Rest' ) ) {

	class Kalaxa_Rest {

		const NS      = 'kalaxa-sync/v1';
		const ID_RE   = '(?P<id>[0-9a-f\-]{36})';

		public static function register_routes() {
			register_rest_route( self::NS, '/projects', array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'list_projects' ),
				'permission_callback' => array( __CLASS__, 'can_read' ),
			) );
			register_rest_route( self::NS, '/projects/' . self::ID_RE . '/status', array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'status' ),
				'permission_callback' => array( __CLASS__, 'can_read' ),
			) );
			// اشتراک عمومی: ساخت/فهرست/ابطال (WRITE) + دریافت پاکت با توکن (عمومی)
			register_rest_route( self::NS, '/projects/' . self::ID_RE . '/shares', array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'share_list' ),
					'permission_callback' => array( __CLASS__, 'can_write' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'share_create' ),
					'permission_callback' => array( __CLASS__, 'can_write' ),
				),
			) );
			register_rest_route( self::NS, '/shares/(?P<hash>[0-9a-f]{64})', array(
				'methods'             => 'DELETE',
				'callback'            => array( __CLASS__, 'share_revoke' ),
				'permission_callback' => array( __CLASS__, 'can_write' ),
			) );
			register_rest_route( self::NS, '/share/(?P<token>[A-Za-z0-9_-]{43})/envelope', array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'share_envelope' ),
				'permission_callback' => '__return_true', // توکن خودش مجوز است
			) );
			register_rest_route( self::NS, '/projects/' . self::ID_RE, array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'pull' ),
					'permission_callback' => array( __CLASS__, 'can_read' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'push' ),
					'permission_callback' => array( __CLASS__, 'can_write' ),
				),
			) );
		}

		public static function can_read() {
			return current_user_can( KALAXA_SYNC_CAP_READ ) || current_user_can( KALAXA_SYNC_CAP_WRITE );
		}

		public static function can_write() {
			return current_user_can( KALAXA_SYNC_CAP_WRITE );
		}

		public static function list_projects() {
			return rest_ensure_response( array( 'ok' => true, 'projects' => Kalaxa_Store::list_projects() ) );
		}

		public static function status( WP_REST_Request $req ) {
			$state = Kalaxa_Store::get_state( $req['id'] );
			if ( null === $state ) {
				return self::err( 'KX_SYNC_NOT_FOUND', 'پروژه روی سرور وجود ندارد', 404 );
			}
			return rest_ensure_response( array( 'ok' => true ) + $state );
		}

		public static function pull( WP_REST_Request $req ) {
			$raw = Kalaxa_Store::get_envelope( $req['id'] );
			if ( null === $raw ) {
				return self::err( 'KX_SYNC_NOT_FOUND', 'پروژه روی سرور وجود ندارد', 404 );
			}
			// امینِ داده: json_decode( $raw, true ) اینجا نادرست است — آبجکت خالی {} را
			// (که در سند واقعی معمول است، مثلاً params یک یونیت تازه) به آرایهٔ PHP []
			// فرومی‌کاهد؛ بازسریال‌سازی بعدی آن را [] برمی‌گرداند، چک‌سام پاکت را باطل
			// می‌کند و Pull سمت کلاینت با CorruptDataError شکست می‌خورد. دیکد شیءمحور
			// (بدون true) طبق قرارداد Kalaxa_Canonical، {} را حفظ می‌کند.
			$resp = new WP_REST_Response( json_decode( $raw ), 200 );
			$resp->header( 'Content-Type', 'application/json; charset=utf-8' );
			return $resp;
		}

		public static function push( WP_REST_Request $req ) {
			$raw = $req->get_body();
			$v   = Kalaxa_Envelope::validate( $raw );
			if ( ! $v['ok'] ) {
				return self::err( $v['error']['code'], $v['error']['message'], 400 );
			}
			$env = $v['envelope'];

			$body_pid = Kalaxa_Envelope::project_id( $env );
			if ( null === $body_pid ) {
				return self::err( 'KX_SYNC_PROJECT_ID', 'project.id در سند نامعتبر است', 400 );
			}
			if ( strtolower( $req['id'] ) !== strtolower( $body_pid ) ) {
				return self::err( 'KX_SYNC_ID_MISMATCH', 'شناسهٔ URL با project.id سند نمی‌خواند', 400 );
			}

			$state    = Kalaxa_Store::get_state( $body_pid );
			$decision = Kalaxa_Push_Policy::decide(
				$state,
				array(
					'revision' => isset( $env['revision'] ) ? $env['revision'] : null,
					'checksum' => isset( $env['checksum'] ) ? $env['checksum'] : null,
				)
			);

			if ( Kalaxa_Push_Policy::CONFLICT === $decision['decision'] ) {
				$resp = self::err( 'KX_SYNC_CONFLICT', $decision['reason_fa'], 409 );
				$resp->data['server'] = $state; // کلاینت برای LWW دستی لازم دارد
				return $resp;
			}
			if ( Kalaxa_Push_Policy::IDEMPOTENT === $decision['decision'] ) {
				return rest_ensure_response( array( 'ok' => true, 'idempotent' => true ) + ( $state ?: array() ) );
			}

			if ( ! Kalaxa_Store::save( $body_pid, $raw, $env, get_current_user_id(), $state ) ) {
				// CAS شکست خورد: بین get_state بالا و همین‌جا رقیبی نوشت (رفع #2).
				// خطای DB واقعی نیست؛ برای کلاینت هم مثل تعارض عادی به‌همراه وضعیت تازه است.
				$fresh = Kalaxa_Store::get_state( $body_pid );
				$resp  = self::err( 'KX_SYNC_CONFLICT',
					'سرور هم‌زمان با این درخواست تغییر کرد — دوباره تلاش کنید', 409 );
				$resp->data['server'] = $fresh;
				return $resp;
			}
			return rest_ensure_response( array(
				'ok'       => true,
				'revision' => isset( $env['revision'] ) ? $env['revision'] : null,
				'checksum' => isset( $env['checksum'] ) ? $env['checksum'] : null,
			) );
		}

		public static function share_create( WP_REST_Request $req ) {
			if ( null === Kalaxa_Store::get_state( $req['id'] ) ) {
				return self::err( 'KX_SYNC_NOT_FOUND', 'پروژه روی سرور وجود ندارد', 404 );
			}
			$days = $req->get_param( 'days' );
			$days = null === $days ? Kalaxa_Share::DEFAULT_DAYS : (int) $days;
			$out  = Kalaxa_Share::create( $req['id'], $days, get_current_user_id() );
			if ( null === $out ) {
				return self::err( 'KX_SHARE_DB', 'ساخت لینک اشتراک شکست خورد', 500 );
			}
			return rest_ensure_response( array( 'ok' => true ) + $out );
		}

		public static function share_list( WP_REST_Request $req ) {
			return rest_ensure_response( array(
				'ok'     => true,
				'shares' => Kalaxa_Share::list_for_project( $req['id'] ),
			) );
		}

		public static function share_revoke( WP_REST_Request $req ) {
			Kalaxa_Share::revoke( $req['hash'] );
			return rest_ensure_response( array( 'ok' => true ) );
		}

		public static function share_envelope( WP_REST_Request $req ) {
			$pid = Kalaxa_Share::resolve( $req['token'] );
			if ( null === $pid ) {
				return self::err( 'KX_SHARE_INVALID', 'لینک اشتراک نامعتبر یا منقضی است', 404 );
			}
			$raw = Kalaxa_Store::get_envelope( $pid );
			if ( null === $raw ) {
				return self::err( 'KX_SYNC_NOT_FOUND', 'پروژه روی سرور وجود ندارد', 404 );
			}
			// همان دلیل pull(): دیکد شیءمحور برای حفظ {} — نگاه کنید به کامنت pull().
			$resp = new WP_REST_Response( json_decode( $raw ), 200 );
			$resp->header( 'X-Robots-Tag', 'noindex' );
			return $resp;
		}

		private static function err( $code, $message, $http ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => array( 'code' => $code, 'message' => $message ) ),
				$http
			);
		}
	}
}
