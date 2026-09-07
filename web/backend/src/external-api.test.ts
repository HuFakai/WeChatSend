import { describe, expect, it } from 'vitest';
import { pickPath, stringValue } from './external-api';

describe('外部 API 响应变量', () => {
  const response = {
    data: {
      weather: { text: '晴', temp: 26 },
      forecast: [{ text: '多云' }],
    },
  };

  it('支持点路径和数组下标路径', () => {
    expect(pickPath(response, 'data.weather.text')).toBe('晴');
    expect(pickPath(response, '$.data.forecast[0].text')).toBe('多云');
  });

  it('把数字和布尔响应转换为模板可用文本', () => {
    expect(stringValue(pickPath(response, 'data.weather.temp'))).toBe('26');
    expect(stringValue(false)).toBe('false');
    expect(stringValue(undefined)).toBeUndefined();
  });
});
