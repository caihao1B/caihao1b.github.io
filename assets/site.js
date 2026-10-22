'use strict';
document.querySelectorAll('.menu-btn').forEach(button=>button.addEventListener('click',()=>{
 const menu=document.getElementById(button.getAttribute('aria-controls'));const open=menu.classList.toggle('open');button.setAttribute('aria-expanded',String(open));
}));
document.querySelectorAll('.nav-links a').forEach(link=>link.addEventListener('click',()=>{
 document.querySelectorAll('.nav-links.open').forEach(n=>n.classList.remove('open'));document.querySelectorAll('.menu-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
}));
