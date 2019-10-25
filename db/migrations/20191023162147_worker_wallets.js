
exports.up = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.string('worker_public_key');
        table.string('worker_secret_key');
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropColumn('worker_public_key');
        table.dropColumn('worker_secret_key');
    })
};
