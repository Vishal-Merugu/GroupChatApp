const { Sequelize } = require("sequelize");

const sequelize = require("../util/database");

const ForgotPasswordRequest = sequelize.define("forgotpasswordrequest", {
    id : {
        type : Sequelize.STRING,
        isNull : false,
        primaryKey : true
    },
    isActive : {
        type : Sequelize.BOOLEAN,
        defaultValue : true
    }
})

module.exports = ForgotPasswordRequest;