const res = await fetch('http://72.62.244.137:8000/rp?user_input=Hello+there,+let%27s+start+RP');
console.log('Status:', res.status);
const text = await res.text();
console.log('Response:', text);
