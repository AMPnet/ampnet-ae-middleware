
exports.up = function(knex) {
    return knex.schema.createTable('coop', function (table) {
        table.string('id').notNullable().unique();
        table.string('coop_contract');
        table.string('eur_contract');
        table.string('coop_owner');
        table.string('eur_owner');
      })
      .alterTable('transaction', function(table) {
          table.string('coop_id').references('id').inTable('coop').onDelete('CASCADE')
      });
};

exports.down = function(knex) {
    return knex.schema.dropTable('coop');
};
