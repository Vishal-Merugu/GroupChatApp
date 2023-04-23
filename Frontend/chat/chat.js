const url = "http://localhost:3000"

const token = localStorage.getItem('token')
const config = {
    headers : {
        Authorization : token
    }
}

const Message = document.querySelector('#message')

if(!token){
    document.querySelector('body').innerHTML = "<h1 class = 'text-center'>Login First<h1>"
}

async function showMessages(messages){
    
    messages.forEach(message => {
        
        const div = document.createElement('div');
        div.classList.add('mb-2');
        div.innerHTML  = `
        <span>${message.user.name} : </span>
        <span >${message.message}</span>
        `    
        document.querySelector("#chat").appendChild(div)
    });

}



document.addEventListener("DOMContentLoaded",async () => {
    document.querySelector("#messageform").onsubmit = async (e) => {
        e.preventDefault();
        
        const message = Message.value ;
        const response = await axios.post(`${url}/chat/message`, { message : message }, config)
        // console.log(response);
    }

    const messages = await axios.get(`${url}/chat/messages`,config)
    showMessages(messages.data)


})
