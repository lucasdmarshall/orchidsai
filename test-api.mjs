const res = await fetch('http://72.62.244.137:8000/health');
const data = await res.json();
console.log('Health:', data);

const chatRes = await fetch('http://72.62.244.137:8000/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Say hello in Burmese', max_tokens: 100 })
});

console.log('Status:', chatRes.status);
console.log('Headers:', Object.fromEntries(chatRes.headers.entries()));

let fullContent = '';
const reader = chatRes.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  fullContent += chunk;
  process.stdout.write(chunk);
}
console.log('\n--- Done ---');
console.log('Total length:', fullContent.length);
