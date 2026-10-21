// Verify rotated credentials work for login WITHOUT printing any password.
// Reads CREDENTIALS.txt, tries login for each account against the local server.
async function main() {
  const { readFileSync } = await import('fs')
  const text = readFileSync('CREDENTIALS.txt', 'utf8')
  // Parse blocks: "<Name> username: x / password: y"
  const accounts: { name: string; username: string; password: string }[] = []
  const lines = text.split('\n')
  let currentName = ''
  for (const line of lines) {
    const nameMatch = line.match(/^([A-Z][a-z]+)\s+username:\s*(\S+)/)
    if (nameMatch) {
      currentName = nameMatch[1]
      accounts.push({ name: currentName, username: nameMatch[2], password: '' })
    }
    const pwdMatch = line.match(/^\s+password:\s*(\S+)/)
    if (pwdMatch && accounts.length) accounts[accounts.length - 1].password = pwdMatch[1]
  }
  let ok = 0
  for (const a of accounts) {
    const res = await fetch('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: a.username, password: a.password }),
    })
    const data = await res.json().catch(() => ({}))
    console.log(`${a.name} (${a.username}): HTTP ${res.status}${data?.user ? ` — role ${data.user.role}, mustChange=${data.user.mustChangePassword}` : ''}`)
    if (res.status === 200) ok++
    // logout to keep session table clean
    const cookie = res.headers.get('set-cookie')?.split(';')[0]
    if (cookie) {
      await fetch('http://127.0.0.1:3000/api/auth/logout', { method: 'POST', headers: { cookie } })
    }
  }
  console.log(`\n${ok}/${accounts.length} logins verified with rotated credentials`)
  if (ok !== accounts.length) process.exit(1)
}
main()
