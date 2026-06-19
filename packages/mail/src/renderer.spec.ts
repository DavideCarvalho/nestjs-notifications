import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MailMessage } from './mail-message';
import { DefaultMailRenderer, MjmlMailRenderer, ReactEmailRenderer } from './renderer';

describe('MjmlMailRenderer', () => {
  it('compiles an mjml body to responsive html with a text fallback', async () => {
    const message = new MailMessage()
      .subject('Hi')
      .mjml(
        '<mjml><mj-body><mj-section><mj-column><mj-text>Hello MJML</mj-text></mj-column></mj-section></mj-body></mjml>',
      );

    const { html, text } = await new MjmlMailRenderer().render(message);

    expect(html).toContain('Hello MJML');
    expect(html.toLowerCase()).toContain('<!doctype html');
    expect(text).toContain('Hello MJML');
  });

  it('falls back to the default renderer when there is no mjml body', async () => {
    const message = new MailMessage().subject('Hi').greeting('Hello!').line('Body');
    const { html } = await new MjmlMailRenderer().render(message);
    expect(html).toContain('Hello!');
  });
});

describe('ReactEmailRenderer', () => {
  it('renders a react body to html and text', async () => {
    const message = new MailMessage().subject('Hi').react(createElement('p', null, 'Welcome Ada'));

    const { html, text } = await new ReactEmailRenderer().render(message);

    expect(html).toContain('Welcome Ada');
    expect(text).toContain('Welcome Ada');
  });

  it('falls back to the default renderer when there is no react body', async () => {
    const message = new MailMessage().subject('Hi').greeting('Hey!');
    const { html } = await new ReactEmailRenderer().render(message);
    expect(html).toContain('Hey!');
    expect(html).toBe(new DefaultMailRenderer().render(message).html);
  });
});