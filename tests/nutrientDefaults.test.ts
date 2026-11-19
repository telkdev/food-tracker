import { describe, expect, it } from 'vitest'
import { estimateExtras, fillExtras100, foodType } from '../shared/nutrientDefaults'

const est = (name: string, kcal: number, c: number) => estimateExtras({ name, kcal, c })

describe('food type from the name', () => {
  it.each([
    ['Szynka wieprzowa Basiuni (шинка)', 'cured-meat'],
    ['Ser Rajski z dziurami plasterkowany (сыр)', 'cheese'],
    ['сыр Favita салатно-бутербродный (Mlekovita)', 'cheese'],
    ['Twaróg chudy Auchan (творог обезжиренный)', 'dairy'],
    ['Шпинат свежий, сырой', 'vegetable'],
    ['Протеин Gold Standard 100% Whey, шоколад (порошок)', 'protein-powder'],
    ['Tortilla pszenno-kukurydziana (тортилья)', 'bread'],
    ['Хлеб чёрный «Гетман» (Aspond)', 'bread-whole'],
    ['хлеб с орехами', 'bread'],
    ['оливковое масло (для яичницы)', 'oil'],
    ['яйца, 2 шт, пожарены', 'egg'],
    ['Пюре картофельное (с молоком и маслом), готовое', 'potato'],
    ['пицца с ветчиной, сыром и грибами', 'dish'],
    ['Гуляш из говядины, готовый (с подливкой)', 'dish'],
    ['Соевый соус', 'soy-sauce'],
    ['Sos Boloński (соус болоньезе)', 'sauce'],
    ['Knoppers Baton Orzeszki ziemne (батончик с арахисом)', 'sweets'],
    ['горячий шоколад Wedel', 'sweet-drink'],
    ['Огурцы солёные', 'pickled'],
    ['Курага', 'fruit'],
    ['Куриная грудка, варёная', 'meat-fish'],
    ['Ryż brązowy Cenos, варёный', 'grain-whole'],
    ['что-то непонятное', 'mixed'],
  ])('%s → %s', (name, type) => {
    expect(foodType(name).type).toBe(type)
  })
})

describe('estimateExtras', () => {
  it('scales sugar with the food\'s own carbs', () => {
    expect(est('Twaróg chudy', 86, 3.5).sugar).toBeCloseTo(3.3, 1)
    expect(est('Mleko zagęszczone słodzone (сгущёнка)', 322, 55).sugar).toBeGreaterThan(50)
  })

  it('never puts more sugar than carbs, and stays in 0–100 g', () => {
    for (const [n, k, c] of [['Сыр камамбер', 300, 0.5], ['Кетчуп', 100, 23], ['Мёд', 304, 82], ['Соевый соус', 53, 5]] as const) {
      const e = est(n, k, c)
      expect(e.sugar).toBeLessThanOrEqual(c)
      for (const v of [e.fiber, e.sugar, e.salt]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
    }
  })

  it('gives typical values for common foods', () => {
    expect(est('Куриная грудка', 165, 0)).toMatchObject({ fiber: 0, sugar: 0, salt: 0.4 })
    expect(est('Хлеб пшенично-ржаной', 250, 47)).toMatchObject({ fiber: 6, salt: 1.2 })
    expect(est('Соевый соус', 53, 5).salt).toBe(14)
    expect(est('банан', 89, 22.8).fiber).toBeCloseTo(3.4, 1)
  })

  it('treats ~0 kcal drinks as nothing', () => {
    expect(est('Чай чёрный без сахара', 1, 0.3)).toMatchObject({ fiber: 0, salt: 0 })
  })
})

describe('fillExtras100', () => {
  it('keeps real values and estimates only the missing ones', () => {
    const r = fillExtras100({ name: 'Кетчуп', kcal: 100, c: 23, fiber: null, sugar: 22, salt: 1.8 })
    expect(r.values).toEqual({ fiber: 0.8, sugar: 22, salt: 1.8 })
    expect(r.estimated).toEqual(['fiber'])
  })

  it('estimates nothing when everything is known (0 is a real value)', () => {
    const r = fillExtras100({ name: 'Куриная грудка', kcal: 165, c: 0, fiber: 0, sugar: 0, salt: 0 })
    expect(r).toEqual({ values: { fiber: 0, sugar: 0, salt: 0 }, estimated: [] })
  })
})
