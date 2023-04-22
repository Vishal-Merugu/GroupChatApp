const {Sequelize} = require('sequelize');

const sequelize = require('../util/database');

const User = sequelize.define('users',{
    id : {
        type : Sequelize.STRING,
        allowNull : false,
        primaryKey : true
    },
    name : {
        type : Sequelize.STRING,
        allowNull: false
    },
    email : {
        type : Sequelize.STRING,
        allowNull: false
    },
    phone : {
        type : Sequelize.BIGINT,
        allowNull: false
    },
    password : {
        type : Sequelize.STRING,
        allowNull: false
    }
})

module.exports = User;