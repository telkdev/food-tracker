import { describe, expect, it } from 'vitest'
import { parseEnvUsers } from '../server/utils/users'

describe('parseEnvUsers (legacy env import)', () => {
  it('imports owner and NUXT_USERS with the old rules', () => {
    const { users, problems } = parseEnvUsers({
      NUXT_APP_PASSWORD: ' owner-password-1 \n',
      NUXT_USERS: 'Nadia:nadia-password-1,dima:short,bad name:whatever-long-1,nadia:dup-password-12',
    })
    expect(users).toEqual([{ id: 'owner', password: 'owner-password-1' }, { id: 'nadia', password: 'nadia-password-1' }])
    expect(problems.join('|')).toMatch(/dima is shorter/)
    expect(problems.join('|')).toMatch(/duplicate user nadia/)
    expect(problems.join('|')).toMatch(/entry #3/)
  })
  it('refuses shared passwords', () => {
    const { users } = parseEnvUsers({ NUXT_APP_PASSWORD: 'same-password-1', NUXT_USERS: 'anna:same-password-1' })
    expect(users).toEqual([])
  })
  it('works with nothing set', () => {
    expect(parseEnvUsers({}).users).toEqual([])
  })
})
