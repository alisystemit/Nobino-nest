async function run() {
  // 1) subdomain module served
  const sub = await fetch('http://localhost:5175/src/lib/subdomain.ts').then(r => r.text()).catch(() => 'ERR');
  console.log('subdomain.ts served:', sub.includes('currentSalonSlug'), '| len', sub.length);

  // 2) API via frontend proxy
  const api = await fetch('http://localhost:5175/api/pages/salon?slug=mah').then(r => r.json());
  console.log('API via proxy found:', api.data?.found, '| salon:', api.data?.salon?.name);
}
run();
