const res = await fetch('http://72.62.244.137:8000/rp?user_input=Hello+there');
console.log('Status:', res.status);
console.log('Content-Type:', res.headers.get('content-type'));
const text = await res.text();
console.log('Response length:', text.length);
console.log('Response:', text.substring(0, 300));
