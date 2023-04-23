const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')

const sequelize = require('./util/database');

const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/message');
const passwordRoutes = require("./routes/password");

const User = require('./models/user');
const Message = require('./models/message');
const ForgotPasswordRequest = require("./models/forgotpasswords");

const app = express();

//to read passwords from .env file
require('dotenv').config()

app.use(bodyParser.json())
app.use(cors({
    origin : "*"
}))

app.use('/user', userRoutes);
app.use('/chat',chatRoutes);
app.use("/password", passwordRoutes)

User.hasMany(Message);
Message.belongsTo(User);
User.hasMany(ForgotPasswordRequest);
ForgotPasswordRequest.belongsTo(User)

sequelize
.sync()
// .sync({ force : true })
.then(() => {
    app.listen(3000)
})
.catch(err => console.log(err))
