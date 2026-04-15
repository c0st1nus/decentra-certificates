use actix_governor::{Governor, GovernorConfigBuilder};
use actix_web::web;

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
                    .configure(admin::configure),
            ),
    );
}
