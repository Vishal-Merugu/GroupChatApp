const sequelize = require('../util/database');

const Sequelize = require("sequelize");

const UserGroup = sequelize.define("usergroups", {
    id : {
        type : Sequelize.INTEGER,
        allowNull : false,
        primaryKey : true,
        autoIncrement : true,
    },
    isadmin : {
        type : Sequelize.BOOLEAN,
        defaultValue : true
    }
})

module.exports = UserGroup