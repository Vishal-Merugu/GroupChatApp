const url = "http://localhost:3000"

const token = localStorage.getItem('token')
const config = {
    headers : {
        Authorization : token
    }
}

if(!token){
    document.querySelector('body').innerHTML = "<h1 class = 'text-center'>Login First<h1>"
}

const Message = document.querySelector("#message")

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#messageform").onsubmit = async (e) => {
        e.preventDefault();
        
        const message = Message.value ;
        const response = await axios.post(`${url}/chat/message`, { message : message }, config)
        // console.log(response);
    }
})
