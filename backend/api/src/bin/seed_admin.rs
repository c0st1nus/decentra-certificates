use std::env;

use anyhow::{Context, Result, bail};
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
};
use chrono::Utc;
use db_migration::Migrator;
use entity::admins;
use sea_orm::{ActiveModelTrait, ColumnTrait, Database, EntityTrait, QueryFilter, Set};
use sea_orm_migration::MigratorTraitSelf;
use uuid::Uuid;

struct Args {
    login: String,
    password: String,
    role: String,
    force: bool,
    inactive: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    let args = parse_args()?;
    validate_role(&args.role)?;

    let database_url =
        env::var("DATABASE_URL").context("missing required environment variable `DATABASE_URL`")?;
    let db = Database::connect(&database_url).await?;
    Migrator.up(&db, None).await?;

    let password_hash = hash_password(&args.password)?;
    let now = Utc::now();

    let existing_admin = admins::Entity::find()
        .filter(admins::Column::Login.eq(&args.login))
        .one(&db)
        .await?;

    match existing_admin {
        Some(existing) => {
            if !args.force {
                bail!(
                    "admin `{}` already exists; pass --force to update the credentials",
                    args.login
                );
            }

            let admin_id = existing.id;
            let mut active_model: admins::ActiveModel = existing.into();
            active_model.password_hash = Set(password_hash);
            active_model.role = Set(args.role.clone());
            active_model.is_active = Set(!args.inactive);
            active_model.updated_at = Set(now);
            active_model.update(&db).await?;

            println!(
                "updated admin: id={admin_id} login={} role={} active={}",
                args.login, args.role, !args.inactive
            );
        }
        None => {
            let admin_id = Uuid::new_v4();
            admins::ActiveModel {
                id: Set(admin_id),
                login: Set(args.login.clone()),
                password_hash: Set(password_hash),
                role: Set(args.role.clone()),
                is_active: Set(!args.inactive),
                last_login_at: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(&db)
            .await?;

            println!(
                "created admin: id={admin_id} login={} role={} active={}",
                args.login, args.role, !args.inactive
            );
        }
    }

    Ok(())
}

fn parse_args() -> Result<Args> {
    let mut login = None;
    let mut password = None;
    let mut role = String::from("super_admin");
    let mut force = false;
    let mut inactive = false;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--login" => login = Some(next_value(&mut args, "--login")?),
            "--password" => password = Some(next_value(&mut args, "--password")?),
            "--role" => role = next_value(&mut args, "--role")?,
            "--force" => force = true,
            "--inactive" => inactive = true,
            "-h" | "--help" => {
                print_usage();
                std::process::exit(0);
            }
            unknown => bail!("unknown argument `{unknown}`"),
        }
    }

    Ok(Args {
        login: validate_login(login.context("missing `--login`")?)?,
        password: validate_password(password.context("missing `--password`")?)?,
        role,
        force,
        inactive,
    })
}

fn next_value(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String> {
    args.next()
        .with_context(|| format!("missing value for `{flag}`"))
}

fn validate_role(role: &str) -> Result<()> {
    match role {
        "super_admin" | "operator" => Ok(()),
        _ => bail!("invalid role `{role}`; expected `super_admin` or `operator`"),
    }
}

fn validate_login(login: String) -> Result<String> {
    if login.len() < 3 {
        bail!("`--login` must be at least 3 characters long");
    }

    Ok(login)
}

fn validate_password(password: String) -> Result<String> {
    if password.len() < 8 {
        bail!("`--password` must be at least 8 characters long");
    }

    Ok(password)
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| anyhow::anyhow!(err.to_string()))?;

    Ok(hash.to_string())
}

fn print_usage() {
    eprintln!(
        "Usage: seed-admin --login <LOGIN> --password <PASSWORD> [--role super_admin|operator] [--force] [--inactive]"
    );
    eprintln!();
    eprintln!("Creates the first admin account or updates it when --force is set.");
}
