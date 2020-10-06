exports.up = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.string('originated_from');
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropColumn('originated_from');
    })
};