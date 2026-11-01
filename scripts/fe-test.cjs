fetch('http://localhost:5175/')
  .then(r => r.text())
  .then(t => {
    console.log('HTML length:', t.length);
    console.log('has root div:', t.includes('id="root"'));
    console.log('has module script:', /type="module"/.test(t));
    const m = t.match(/src="([^"]+)"/g);
    console.log('src refs:', m ? m.join(' | ') : 'none');
  })
  .catch(e => console.log('ERR', e.message));
