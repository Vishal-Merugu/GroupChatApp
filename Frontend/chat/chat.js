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
    
    let chat = [] ;
    messages.forEach(message => {

        if(message.user.id == localStorage.getItem('id')){
            name = ""
            msgclass = 'float-end'
            msgcolor = "mymsgcolor"  
        }
        else{
            name = message.user.name + ":"
            msgclass = ""
            msgcolor = "othermsgcolor"
        } 

        chat += `
        <div class="mb-2 ${msgcolor}">
            <div class = "container ms-0 ps-0">
            <div class="row">
                <div class="col mt-1 mb-1">
                    <span id = "sendername" class = "${msgclass} ps-1 pe-1 text-center">${name}</span>
                    <span class = "${msgclass} p-2">${message.message}</span>
                </div>
            </div>
            </div>
        </div>
        `
    });

    document.querySelector("#chat").innerHTML = chat
}



document.addEventListener("DOMContentLoaded",async () => {
    document.querySelector("#messageform").onsubmit = async (e) => {
        e.preventDefault();
        
        const message = Message.value ;
        if(message){
            await axios.post(`${url}/chat/message`, { message : message }, config)
            // console.log(response);
            Message.value = ""
        }
    }

    window.setInterval(async () => {

        let oldMessages = localStorage.getItem("oldmessages");

        if(!oldMessages){
            lastMessageId = -1;
        }
        else{
            
            oldMessages = JSON.parse(localStorage.getItem("oldmessages"))
            lastMessageId = +oldMessages[oldMessages.length - 1].id
            // console.log(lastMessageId);
        }

        const newMessages = await axios.get(`${url}/chat/messages?lastmessageid=${lastMessageId}`,config)

        if(lastMessageId == -1){
            const oldMessages = JSON.stringify(newMessages.data);
            localStorage.setItem("oldmessages", oldMessages)
        }
        else if(newMessages.data.length > 0) {

            const oldMessages = JSON.parse(localStorage.getItem("oldmessages"))

            const concatMessages = oldMessages.concat(newMessages.data);

            let slicedMessages ;
            if(concatMessages.length > 15){
                slicedMessages = concatMessages.slice(-15);
            }

            localStorage.setItem("oldmessages",JSON.stringify(slicedMessages))
            
        }

        messagesToShow = JSON.parse(localStorage.getItem("oldmessages"))

        showMessages(messagesToShow);
    },1000)


    document.querySelector("#logout").onclick = () => {
        localStorage.removeItem('id');
        localStorage.removeItem("token")
        window.location.href = "../login/login.html"
    }


})
