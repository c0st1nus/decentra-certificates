use actix_cors::Cors;
use actix_governor::{Governor, GovernorConfigBuilder};
use actix_web::{middleware::from_fn, web};

use crate::middleware::auth::require_admin_auth;
use crate::routes::{admin, public, system};

pub fn build_app(cfg: &mut web::ServiceConfig) {
    let public_governor = GovernorConfigBuilder::default()
        .milliseconds_per_request(250)
        .burst_size(10)
        .finish()
        .expect("public rate limiter config must be valid");

    let admin_governor = GovernorConfigBuilder::default()
        .seconds_per_request(1)
        .burst_size(5)
        .finish()
        .expect("admin rate limiter config must be valid");

    cfg.service(
        web::scope("/api/v1")
            .service(web::scope("/system").configure(system::configure))
            .service(
                web::scope("/public")
                    .wrap(Governor::new(&public_governor))
                    .configure(public::configure),
            )
            .service(
                web::scope("/admin")
                    .wrap(Governor::new(&admin_governor))
                    .service(web::scope("/auth").configure(admin::configure_public_auth))
                    .service(
                        web::scope("")
                            .wrap(from_fn(require_admin_auth))
                            .configure(admin::configure_protected),
                    ),
            ),
    );
}

pub fn build_cors(origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allow_any_header()
        .allow_any_method()
        .expose_headers(["Content-Disposition"])
        .supports_credentials();

    for origin in origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
