const chatButtonHtml=
`<div class="aibox-chat-button" >
<img style="height:60px;width:60px;" src="https://foruda.gitee.com/images/1729500329340181338/aa79a8af_441246.png">
</div>`

const getChatContainerHtml=(url)=>{
 return `<div id="aibox-chat-container">
<iframe id="aibox-chat" allow="microphone" src=${url}></iframe>
<div class="aibox-operate"><div class="aibox-closeviewport aibox-viewportnone"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
<path d="M7.507 11.6645C7.73712 11.6645 7.94545 11.7578 8.09625 11.9086C8.24706 12.0594 8.34033 12.2677 8.34033 12.4978V16.7976C8.34033 17.0277 8.15378 17.2143 7.92366 17.2143H7.09033C6.86021 17.2143 6.67366 17.0277 6.67366 16.7976V14.5812L3.41075 17.843C3.24803 18.0057 2.98421 18.0057 2.82149 17.843L2.23224 17.2537C2.06952 17.091 2.06952 16.8272 2.23224 16.6645L5.56668 13.3311H3.19634C2.96622 13.3311 2.77967 13.1446 2.77967 12.9145V12.0811C2.77967 11.851 2.96622 11.6645 3.19634 11.6645H7.507ZM16.5991 2.1572C16.7619 1.99448 17.0257 1.99448 17.1884 2.1572L17.7777 2.74645C17.9404 2.90917 17.9404 3.17299 17.7777 3.33571L14.4432 6.66904H16.8136C17.0437 6.66904 17.2302 6.85559 17.2302 7.08571V7.91904C17.2302 8.14916 17.0437 8.33571 16.8136 8.33571H12.5029C12.2728 8.33571 12.0644 8.24243 11.9136 8.09163C11.7628 7.94082 11.6696 7.73249 11.6696 7.50237V3.20257C11.6696 2.97245 11.8561 2.7859 12.0862 2.7859H12.9196C13.1497 2.7859 13.3362 2.97245 13.3362 3.20257V5.419L16.5991 2.1572Z" fill="#646A73"/>
</svg></div>
<div class="aibox-openviewport">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
<path d="M7.15209 11.5968C7.31481 11.4341 7.57862 11.4341 7.74134 11.5968L8.3306 12.186C8.49332 12.3487 8.49332 12.6126 8.3306 12.7753L4.99615 16.1086H7.3665C7.59662 16.1086 7.78316 16.2952 7.78316 16.5253V17.3586C7.78316 17.5887 7.59662 17.7753 7.3665 17.7753H3.05584C2.82572 17.7753 2.61738 17.682 2.46658 17.5312C2.31578 17.3804 2.2225 17.1721 2.2225 16.9419V12.6421C2.2225 12.412 2.40905 12.2255 2.63917 12.2255H3.4725C3.70262 12.2255 3.88917 12.412 3.88917 12.6421V14.8586L7.15209 11.5968ZM16.937 2.22217C17.1671 2.22217 17.3754 2.31544 17.5262 2.46625C17.677 2.61705 17.7703 2.82538 17.7703 3.0555V7.35531C17.7703 7.58543 17.5837 7.77198 17.3536 7.77198H16.5203C16.2902 7.77198 16.1036 7.58543 16.1036 7.35531V5.13888L12.8407 8.40068C12.678 8.5634 12.4142 8.5634 12.2515 8.40068L11.6622 7.81142C11.4995 7.64871 11.4995 7.38489 11.6622 7.22217L14.9966 3.88883H12.6263C12.3962 3.88883 12.2096 3.70229 12.2096 3.47217V2.63883C12.2096 2.40872 12.3962 2.22217 12.6263 2.22217H16.937Z" fill="#646A73"/>
</svg></div>
<div class="aibox-chat-close"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
           <path d="M9.95317 8.73169L15.5511 3.13376C15.7138 2.97104 15.9776 2.97104 16.1403 3.13376L16.7296 3.72301C16.8923 3.88573 16.8923 4.14955 16.7296 4.31227L11.1317 9.9102L16.7296 15.5081C16.8923 15.6708 16.8923 15.9347 16.7296 16.0974L16.1403 16.6866C15.9776 16.8494 15.7138 16.8494 15.5511 16.6866L9.95317 11.0887L4.35524 16.6866C4.19252 16.8494 3.9287 16.8494 3.76598 16.6866L3.17673 16.0974C3.01401 15.9347 3.01401 15.6708 3.17673 15.5081L8.77465 9.9102L3.17673 4.31227C3.01401 4.14955 3.01401 3.88573 3.17673 3.72301L3.76598 3.13376C3.9287 2.97104 4.19252 2.97104 4.35524 3.13376L9.95317 8.73169Z" fill="#646A73"/>
           </svg>
 </div></div>
`
}

const initializeChat=(root)=>{
  // Get the data-bot-src attribute from the script tag
  const scriptTag = document.getElementById('chatbot-iframe');
  const botSrc = scriptTag.getAttribute('data-bot-src');
  // Add chat icon
  root.insertAdjacentHTML("beforeend",chatButtonHtml)
  // Add chat container with the correct URL
  root.insertAdjacentHTML('beforeend',getChatContainerHtml(botSrc))
  // 按钮元素
  const chat_button=root.querySelector('.aibox-chat-button')
  const chat_button_img=root.querySelector('.aibox-chat-button > img')
  //  对话框元素
  const chat_container=root.querySelector('#aibox-chat-container')

  const viewport=root.querySelector('.aibox-openviewport')
  const closeviewport=root.querySelector('.aibox-closeviewport')
  const close_func=()=>{
    chat_container.style['display']=chat_container.style['display']=='block'?'none':'block'
    chat_button.style['display']=chat_container.style['display']=='block'?'none':'block'
  }
  close_icon=chat_container.querySelector('.aibox-chat-close')
  chat_button.onclick = close_func
  close_icon.onclick=close_func
  const viewport_func=()=>{
    if(chat_container.classList.contains('aibox-enlarge')){
      chat_container.classList.remove("aibox-enlarge");
      viewport.classList.remove('aibox-viewportnone')
      closeviewport.classList.add('aibox-viewportnone')
    }else{
      chat_container.classList.add("aibox-enlarge");
      viewport.classList.add('aibox-viewportnone')
      closeviewport.classList.remove('aibox-viewportnone')
    }
  }
     const drag=(e)=>{
            if (['touchmove','touchstart'].includes(e.type)) {
             chat_button.style.top=(e.touches[0].clientY-25)+'px'
             chat_button.style.left=(e.touches[0].clientX-25)+'px'
          } else {
             chat_button.style.top=(e.y-25)+'px'
             chat_button.style.left=(e.x-25)+'px'
          }
            chat_button.style.width =chat_button_img.naturalWidth+'px'
            chat_button.style.height =chat_button_img.naturalHeight+'px'
        }
  if(true){
    console.dir(chat_button_img)
    chat_button.addEventListener("drag",drag)
    chat_button.addEventListener("dragover",(e)=>{
              e.preventDefault()
    })
    chat_button.addEventListener("dragend",drag)
    chat_button.addEventListener("touchstart",drag)
    chat_button.addEventListener("touchmove",drag)
  }
  viewport.onclick=viewport_func
  closeviewport.onclick=viewport_func
}
/**
 * 第一次进来的引导提示
 */
function initializeAIBox(){
  const aibox=document.createElement('div')
  const root=document.createElement('div')
  root.id="aibox"
  initializeAIBoxStyle(aibox)
  aibox.appendChild(root)
  document.body.appendChild(aibox)
  initializeChat(root)
}

 
// 初始化全局样式
function initializeAIBoxStyle(root){
  style=document.createElement('style')
  style.type='text/css'
  style.innerText=  `
  /* 放大 */
  #aibox .aibox-enlarge {
      width: 50%!important;
      height: 100%!important;
      bottom: 0!important;
      right: 0 !important;
  }
  @media only screen and (max-width: 768px){
  #aibox .aibox-enlarge {
      width: 100%!important;
      height: 100%!important;
      right: 0 !important;
      bottom: 0!important;
  }
  }
  
  /* 引导 */
  
  #aibox .aibox-mask {
      position: fixed;
      z-index: 999;
      background-color: transparent;
      height: 100%;
      width: 100%;
      top: 0;
      left: 0;
  }
  #aibox .aibox-mask .aibox-content {
      width: 64px;
      height: 64px;
      box-shadow: 1px 1px 1px 2000px rgba(0,0,0,.6);
      position: absolute;
      right: 0;
      bottom: 30px;
      z-index: 1000;
  }
  #aibox-chat-container {
        width: 450px;
        height: 600px;
        display:none;
      }
  @media only screen and (max-width: 768px) {
        #aibox-chat-container {
          width: 100%;
          height: 70%;
          right: 0 !important;
        }
      }
      
      #aibox .aibox-chat-button{
        position: fixed;
        bottom: 4rem;
        right: 1rem;
        cursor: pointer;
        max-height:500px;
        max-width:500px;
    }
    #aibox #aibox-chat-container{
        z-index:10000;position: relative;
              border-radius: 8px;
              border: 1px solid #ffffff;
              background: linear-gradient(188deg, rgba(235, 241, 255, 0.20) 39.6%, rgba(231, 249, 255, 0.20) 94.3%), #EFF0F1;
              box-shadow: 0px 4px 8px 0px rgba(31, 35, 41, 0.10);
              position: fixed;bottom: 16px;right: 16px;overflow: hidden;
    }

     #aibox #aibox-chat-container .aibox-operate{
     top: 18px;
     right: 15px;
     position: absolute;
     display: flex;
     align-items: center;
     }
    #aibox #aibox-chat-container .aibox-operate .aibox-chat-close{
            margin-left:5px;
            cursor: pointer;
    }
    #aibox #aibox-chat-container .aibox-operate .aibox-openviewport{

            cursor: pointer;
    }
    #aibox #aibox-chat-container .aibox-operate .aibox-closeviewport{

      cursor: pointer;
    }
    #aibox #aibox-chat-container .aibox-viewportnone{
      display:none;
    }
    #aibox #aibox-chat-container #aibox-chat{
     height:100%;
     width:100%;
     border: none;
}
    #aibox #aibox-chat-container {
                animation: appear .4s ease-in-out;
              }
              @keyframes appear {
                from {
                  height: 0;;
                }
        
                to {
                  height: 600px;
                }
              }`
  root.appendChild(style)
}

function embedAIChatbot() {
  
  initializeAIBox()

}
window.onload = embedAIChatbot


