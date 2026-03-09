// Script to add a new masjid to the mock server
// Usage: node add-masjid.js

const http = require('http');

const newMasjid = {
  name: "Your Masjid Name",
  url: "https://awqat.com.au/yourmasjid/",  // Change this to your masjid's Awqat URL
  city: "Sydney",
  state: "NSW",
  timezone: "Australia/Sydney"
};

// For the real backend (when Docker is running), use this:
const backendUrl = 'http://localhost:8080';

// To add to the real backend API:
function addToBackend(masjid) {
  const data = JSON.stringify(masjid);

  const options = {
    hostname: 'localhost',
    port: 8080,
    path: '/api/v1/admin/masjids',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 201) {
        console.log('✅ Masjid added successfully!');
        console.log(JSON.parse(responseData));
      } else {
        console.log(`❌ Failed to add masjid. Status: ${res.statusCode}`);
        console.log(responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error connecting to backend:', error.message);
    console.log('\n💡 Make sure the backend is running:');
    console.log('   cd backend && docker compose up -d');
  });

  req.write(data);
  req.end();
}

console.log('Adding masjid:', newMasjid);
addToBackend(newMasjid);
