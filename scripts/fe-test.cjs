fetch('http://localhost:5175/')
  .then(r => r.text())
  .then(t => {
    console.log('STATUS OK. HTML length:', t.length);
    console.log('--- HTML content ---');
    console.log(t.slice(0, 1500));
  })
  .catch(e => console.log('ERR', e.message));
