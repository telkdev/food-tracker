import { describe, expect, it } from 'vitest'
import { TREAT } from '../server/utils/suggest'

describe('TREAT (sweets and fast food kept out of older history)', () => {
  it('catches sweets and fast food', () => {
    for (const n of ['пицца с ветчиной (кусок), готовая', 'Тирамису', 'Sacher cake', 'Шоколад молочный', 'Чипсы Lay’s', 'Бургер говяжий', 'Pączek z różą', 'Шаурма с курицей', 'Морозиво пломбір'])
      expect(TREAT.test(n.toLowerCase()), n).toBe(true)
  })
  it('leaves normal food alone', () => {
    for (const n of ['куриная грудка, гриль', 'печень куриная', 'tortilla pszenna', 'baton proteinowy', 'гречка, отварная', 'скир натуральный', 'хлеб цельнозерновой', 'школьный суп'])
      expect(TREAT.test(n), n).toBe(false)
  })
})
