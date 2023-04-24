const sequelize = require("../util/database")

const { Sequelize } = require("sequelize");

const Group = sequelize.define("groups", {
    id : {
        type : Sequelize.INTEGER,
        allowNull : false,
        primaryKey : true,
        autoIncrement : true
    },
    name : {
        type : Sequelize.STRING,
        allowNull : false
    }
})

module.exports = Group

