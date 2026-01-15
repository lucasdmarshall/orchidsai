const res = await fetch('http://72.62.244.137:8000/health');
const data = await res.json();
console.log('Health:', data);

const chatRes = await fetch('http://72.62.244.137:8000/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello', max_tokens: 50 })
});

console.log('Status:', chatRes.status);
const reader = chatRes.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value, { stream: true }));
}
console.log('\n--- Done ---');
