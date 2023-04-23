const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')

const sequelize = require('./util/database');

const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/message')

const User = require('./models/user');
const Message = require('./models/message');

const app = express();

//to read passwords from .env file
require('dotenv').config()

app.use(bodyParser.json())
app.use(cors({
    origin : "*"
}))

app.use('/user', userRoutes)
app.use('/chat',chatRoutes)

User.hasMany(Message)
Message.belongsTo(User)

sequelize
.sync()
// .sync({ force : true })
.then(() => {
    app.listen(3000)
})
.catch(err => console.log(err))
