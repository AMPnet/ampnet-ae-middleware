DROP DATABASE IF EXISTS ae_middleware_local;
CREATE DATABASE ae_middleware_local ENCODING 'UTF-8';

DROP DATABASE IF EXISTS ae_middleware_local_queue;
CREATE DATABASE ae_middleware_local_queue ENCODING 'UTF-8';

DROP DATABASE IF EXISTS ae_middleware_testnet;
CREATE DATABASE ae_middleware_testnet ENCODING 'UTF-8';

DROP DATABASE IF EXISTS ae_middleware_testnet_queue;
CREATE DATABASE ae_middleware_testnet_queue ENCODING 'UTF-8';

DROP USER IF EXISTS ae_middleware_local;
CREATE USER ae_middleware_local WITH PASSWORD 'password';

DROP USER IF EXISTS ae_middleware_local_queue;
CREATE USER ae_middleware_local_queue WITH PASSWORD 'password';

DROP USER IF EXISTS ae_middleware_testnet;
CREATE USER ae_middleware_testnet WITH PASSWORD 'password';

DROP USER IF EXISTS ae_middleware_testnet_queue;
CREATE USER ae_middleware_testnet_queue WITH PASSWORD 'password';

GRANT CREATE ON DATABASE ae_middleware_local_queue TO ae_middleware_local;
GRANT CREATE ON DATABASE ae_middleware_testnet_queue TO ae_middleware_testnet;

\connect ae_middleware_testnet_queue
CREATE EXTENSION pgcrypto;

\connect ae_middleware_local_queue
CREATE EXTENSION pgcrypto;

