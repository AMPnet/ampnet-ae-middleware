DROP DATABASE IF EXISTS ae_middleware_local;
CREATE DATABASE ae_middleware_local ENCODING 'UTF-8';

DROP DATABASE IF EXISTS ae_middleware_testnet;
CREATE DATABASE ae_middleware_testnet ENCODING 'UTF-8';

DROP USER IF EXISTS ae_middleware_local;
CREATE USER ae_middleware_local WITH PASSWORD 'password';

DROP USER IF EXISTS ae_middleware_testnet;
CREATE USER ae_middleware_testnet WITH PASSWORD 'password';