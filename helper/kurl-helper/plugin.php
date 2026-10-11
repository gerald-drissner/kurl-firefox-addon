<?php
/*
Plugin Name: kURL Helper
Description: Adds safe lookup, editing, regeneration and deletion to YOURLS for kURL clients.
Version: 1.1.7
Author: Gerald Drißner
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
*/

if ( ! defined( 'YOURLS_ABSPATH' ) ) {
    die();
}

yourls_add_filter( 'api_action_kurl_ping', 'kurl_api_ping' );
yourls_add_filter( 'api_action_kurl_delete', 'kurl_api_delete' );
yourls_add_filter( 'api_action_kurl_find_by_url', 'kurl_api_find_by_url' );
yourls_add_filter( 'api_action_kurl_regenerate', 'kurl_api_regenerate' );

/**
 * YOURLS checks API credentials only on private installations (YOURLS_PRIVATE
 * true and YOURLS_PRIVATE_API not false). Lookup, edit, regeneration and
 * deletion must never be anonymous, so the credentials are verified here as
 * well. API requests never accept the admin cookie (no cross-site requests).
 */
function kurl_api_require_auth() {
    if ( true === yourls_is_valid_user() ) {
        return null;
    }
    return [
        'statusCode' => 403,
        'errorCode'  => '403',
        'status'     => 'fail',
        'message'    => 'Authentication required',
    ];
}

function kurl_api_ping() {
    return [
        'statusCode'          => 200,
        'status'              => 'success',
        'message'             => 'success',
        'kurl_extended'       => true,
        'kurl_helper_version' => '1.1.7',
        'kurl_capabilities'   => [ 'delete', 'find_by_url', 'regenerate' ],
    ];
}

function kurl_api_request_string( $key ) {
    // Accept normal API GET or POST parameters, but never fall back to cookies as
    // PHP's combined $_REQUEST array can do depending on server configuration.
    if ( isset( $_POST[ $key ] ) && is_scalar( $_POST[ $key ] ) ) {
        return trim( (string) $_POST[ $key ] );
    }
    if ( isset( $_GET[ $key ] ) && is_scalar( $_GET[ $key ] ) ) {
        return trim( (string) $_GET[ $key ] );
    }
    return '';
}

function kurl_api_scalar_string( $value, $default = '' ) {
    return is_scalar( $value ) ? (string) $value : (string) $default;
}

function kurl_api_keyword_from_shorturl( $shorturl ) {
    $path = parse_url( trim( (string) $shorturl ), PHP_URL_PATH );
    if ( ! is_string( $path ) || trim( $path, '/' ) === '' ) {
        return '';
    }

    $segment = basename( rtrim( $path, '/' ) );
    $decoded = rawurldecode( $segment );
    if ( $decoded === '' || preg_match( '~[\x00-\x20\x7F/\\?#&=]~u', $decoded ) ) {
        return '';
    }

    $keyword = yourls_sanitize_keyword( $decoded, true );
    return is_string( $keyword ) && $keyword !== '' && hash_equals( $decoded, $keyword ) ? $keyword : '';
}

function kurl_api_shorturl_belongs_to_installation( $shorturl, $keyword ) {
    $given     = parse_url( trim( (string) $shorturl ) );
    $canonical = parse_url( (string) yourls_link( $keyword ) );

    foreach ( [ $given, $canonical ] as $parts ) {
        if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) || empty( $parts['path'] ) ) {
            return false;
        }
        if ( isset( $parts['user'] ) || isset( $parts['pass'] ) || isset( $parts['query'] ) || isset( $parts['fragment'] ) ) {
            return false;
        }
    }

    $given_scheme     = strtolower( (string) $given['scheme'] );
    $canonical_scheme = strtolower( (string) $canonical['scheme'] );
    // The site may still be configured with http:// behind a TLS-terminating
    // reverse proxy. Accept its external https:// URL, never an HTTP downgrade.
    $scheme_matches = $given_scheme === $canonical_scheme;
    $https_upgrade = $given_scheme === 'https' && $canonical_scheme === 'http';
    if ( ! in_array( $given_scheme, [ 'http', 'https' ], true ) ||
         ! in_array( $canonical_scheme, [ 'http', 'https' ], true ) ||
         ( ! $scheme_matches && ! $https_upgrade ) ) {
        return false;
    }

    $given_port = isset( $given['port'] ) ? (int) $given['port'] : ( $given_scheme === 'https' ? 443 : 80 );
    $canonical_port = isset( $canonical['port'] ) ? (int) $canonical['port'] : ( $canonical_scheme === 'https' ? 443 : 80 );
    $ports_match = $given_port === $canonical_port;
    if ( $https_upgrade && ! isset( $given['port'] ) && ! isset( $canonical['port'] ) ) {
        $ports_match = true; // default HTTPS 443 externally / HTTP 80 internally; equal explicit ports are also allowed
    }
    $given_path = rawurldecode( rtrim( (string) $given['path'], '/' ) );
    $canonical_path = rawurldecode( rtrim( (string) $canonical['path'], '/' ) );

    return strtolower( (string) $given['host'] ) === strtolower( (string) $canonical['host'] )
        && $ports_match
        && $given_path !== ''
        && hash_equals( $canonical_path, $given_path );
}

function kurl_api_sanitize_longurl( $url ) {
    $url = yourls_sanitize_url( trim( (string) $url ) );
    if ( ! is_string( $url ) || $url === '' || $url === 'http://' || $url === 'https://' ) {
        return '';
    }

    $parts = parse_url( $url );
    if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
        return '';
    }

    $scheme = strtolower( (string) $parts['scheme'] );
    return in_array( $scheme, [ 'http', 'https' ], true ) ? $url : '';
}

function kurl_api_info_value( $info, $key, $default = '' ) {
    if ( is_array( $info ) && array_key_exists( $key, $info ) ) {
        return $info[ $key ];
    }
    if ( is_object( $info ) && isset( $info->{$key} ) ) {
        return $info->{$key};
    }
    return $default;
}

function kurl_api_delete() {
    $denied = kurl_api_require_auth();
    if ( null !== $denied ) {
        return $denied;
    }
    $shorturl = kurl_api_request_string( 'shorturl' );
    if ( $shorturl === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Missing shorturl' ];
    }

    $keyword = kurl_api_keyword_from_shorturl( $shorturl );
    if ( $keyword === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Invalid shorturl' ];
    }

    if ( ! kurl_api_shorturl_belongs_to_installation( $shorturl, $keyword ) ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Short URL does not belong to this YOURLS installation' ];
    }

    $info = yourls_get_keyword_infos( $keyword, false );
    if ( ! $info ) {
        return [ 'statusCode' => 404, 'status' => 'fail', 'message' => 'Not found' ];
    }

    try {
        $deleted = (int) yourls_delete_link_by_keyword( $keyword );
    } catch ( Throwable $exception ) {
        return [ 'statusCode' => 500, 'status' => 'fail', 'message' => 'Deletion failed' ];
    }
    if ( $deleted < 1 ) {
        return [ 'statusCode' => 500, 'status' => 'fail', 'message' => 'Deletion failed' ];
    }

    return [ 'statusCode' => 200, 'status' => 'success', 'message' => 'Deleted', 'keyword' => $keyword ];
}

function kurl_api_find_by_url() {
    $denied = kurl_api_require_auth();
    if ( null !== $denied ) {
        return $denied;
    }
    $requested_url = kurl_api_request_string( 'url' );
    if ( $requested_url === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Missing url' ];
    }

    $longurl = kurl_api_sanitize_longurl( $requested_url );
    if ( $longurl === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Invalid url' ];
    }

    $keyword_values = yourls_get_longurl_keywords( $longurl, 'ASC' );
    $keywords = [];
    if ( is_array( $keyword_values ) ) {
        foreach ( $keyword_values as $keyword_value ) {
            if ( ! is_scalar( $keyword_value ) ) {
                continue;
            }
            $candidate = (string) $keyword_value;
            $sanitized = yourls_sanitize_keyword( $candidate, true );
            if ( is_string( $sanitized ) && $sanitized !== '' && hash_equals( $candidate, $sanitized ) ) {
                $keywords[] = $sanitized;
            }
        }
    }
    $keywords = array_values( array_unique( $keywords ) );
    if ( empty( $keywords ) ) {
        return [ 'statusCode' => 404, 'status' => 'fail', 'message' => 'Not found' ];
    }

    $keyword = '';
    $preferred_url = kurl_api_request_string( 'preferred_shorturl' );
    if ( $preferred_url !== '' ) {
        $preferred = kurl_api_keyword_from_shorturl( $preferred_url );
        if ( $preferred !== '' && kurl_api_shorturl_belongs_to_installation( $preferred_url, $preferred ) && in_array( $preferred, $keywords, true ) ) {
            $keyword = $preferred;
        }
    }
    if ( $keyword === '' ) {
        $keyword = reset( $keywords );
    }

    $info = yourls_get_keyword_infos( $keyword, false );
    if ( ! $info ) {
        return [ 'statusCode' => 404, 'status' => 'fail', 'message' => 'Not found' ];
    }

    return [
        'statusCode' => 200,
        'status'     => 'success',
        'message'    => 'Found',
        'shorturl'   => yourls_link( $keyword ),
        'longurl'    => kurl_api_scalar_string( kurl_api_info_value( $info, 'url', $longurl ), $longurl ),
        'keyword'    => $keyword,
        'title'      => kurl_api_scalar_string( kurl_api_info_value( $info, 'title', '' ) ),
    ];
}

function kurl_api_random_keyword( $longurl ) {
    $charset_value = yourls_get_shorturl_charset();
    $charset = is_scalar( $charset_value ) ? (string) $charset_value : '';
    $chars   = preg_split( '//u', $charset, -1, PREG_SPLIT_NO_EMPTY );
    if ( ! is_array( $chars ) || empty( $chars ) ) {
        $chars = str_split( '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' );
    }

    $length_seed = yourls_int2string( yourls_get_next_decimal() );
    $length = max( 4, strlen( kurl_api_scalar_string( $length_seed ) ) );
    $last   = count( $chars ) - 1;

    for ( $attempt = 0; $attempt < 100; $attempt++ ) {
        $candidate_length = $length + intdiv( $attempt, 25 );
        $candidate = '';
        for ( $position = 0; $position < $candidate_length; $position++ ) {
            try {
                $index = random_int( 0, $last );
            } catch ( Throwable $exception ) {
                $index = mt_rand( 0, $last );
            }
            $candidate .= $chars[ $index ];
        }

        $candidate = yourls_apply_filter( 'random_keyword', $candidate, $longurl, '' );
        $candidate = is_scalar( $candidate ) ? yourls_sanitize_keyword( (string) $candidate, true ) : '';
        if ( $candidate !== '' && yourls_keyword_is_free( $candidate ) ) {
            return $candidate;
        }
    }

    return '';
}

function kurl_api_regenerate() {
    $denied = kurl_api_require_auth();
    if ( null !== $denied ) {
        return $denied;
    }
    $requested_url      = kurl_api_request_string( 'url' );
    $requested_shorturl = kurl_api_request_string( 'shorturl' );
    if ( $requested_url === '' || $requested_shorturl === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Missing url or shorturl' ];
    }

    $longurl    = kurl_api_sanitize_longurl( $requested_url );
    $oldkeyword = kurl_api_keyword_from_shorturl( $requested_shorturl );
    if ( $longurl === '' || $oldkeyword === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Invalid url or shorturl' ];
    }
    if ( ! kurl_api_shorturl_belongs_to_installation( $requested_shorturl, $oldkeyword ) ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Short URL does not belong to this YOURLS installation' ];
    }

    $info = yourls_get_keyword_infos( $oldkeyword, false );
    if ( ! $info ) {
        return [ 'statusCode' => 404, 'status' => 'fail', 'message' => 'Not found' ];
    }

    $requested_keyword = kurl_api_request_string( 'keyword' );
    if ( $requested_keyword !== '' ) {
        $newkeyword = yourls_sanitize_keyword( $requested_keyword, true );
        if ( ! is_string( $newkeyword ) || $newkeyword === '' || ! hash_equals( $requested_keyword, $newkeyword ) ) {
            return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Invalid keyword' ];
        }
    } else {
        $newkeyword = kurl_api_random_keyword( $longurl );
    }

    if ( $newkeyword === '' ) {
        return [ 'statusCode' => 400, 'status' => 'fail', 'message' => 'Invalid keyword' ];
    }

    $requested_title = kurl_api_request_string( 'title' );
    $title = $requested_title !== ''
        ? $requested_title
        : kurl_api_scalar_string( kurl_api_info_value( $info, 'title', '' ) );
    $title = yourls_sanitize_title( $title );

    try {
        $result = yourls_edit_link( $longurl, $oldkeyword, $newkeyword, $title );
    } catch ( Throwable $exception ) {
        return [ 'statusCode' => 500, 'status' => 'fail', 'message' => 'Regeneration failed' ];
    }
    if ( ! is_array( $result ) || ( $result['status'] ?? '' ) !== 'success' ) {
        $current = yourls_get_keyword_infos( $newkeyword, false );
        $matches = $newkeyword === $oldkeyword
            && $current
            && kurl_api_scalar_string( kurl_api_info_value( $current, 'url', '' ) ) === $longurl
            && kurl_api_scalar_string( kurl_api_info_value( $current, 'title', '' ) ) === $title;
        if ( ! $matches ) {
            return [
                'statusCode' => 400,
                'status'     => 'fail',
                'message'    => is_array( $result ) && is_scalar( $result['message'] ?? null ) && (string) $result['message'] !== ''
                    ? (string) $result['message']
                    : 'Regeneration failed',
            ];
        }
    }

    return [
        'statusCode' => 200,
        'status'     => 'success',
        'message'    => 'Regenerated',
        'shorturl'   => yourls_link( $newkeyword ),
        'longurl'    => $longurl,
        'keyword'    => $newkeyword,
        'url'        => isset( $result['url'] ) && is_array( $result['url'] ) ? $result['url'] : [],
    ];
}
