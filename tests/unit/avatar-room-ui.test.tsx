import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultRoom, roomItems } from '../../src/core/room-catalog';
import { AvatarRoom } from '../../src/features/reviews/AvatarRoom';

// jsdom does not implement native dialogs. Browser E2E covers actual modal focus.
const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
});
afterAll(() => {
  dialogMethods.forEach((name, index) => {
    const descriptor = originalMethods[index];
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});
afterEach(cleanup);

const props = {
  avatar: 'monchichi' as const,
  room: defaultRoom,
  ownedItemIds: [],
  balance: 20_000,
  busy: false,
  onSelect: vi.fn(),
};
const imageSelectors =
  'svg, img, picture, canvas, video, .avatar-room-scene, .room-item-preview, .room-item-picture';

function card(id: string) {
  const found = screen
    .getAllByTestId('room-item')
    .find((element) => element.getAttribute('data-item-id') === id);
  expect(found, `card ${id}`).toBeDefined();
  return found!;
}

async function openShop() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '방 꾸미기' }));
  return user;
}

it('shows text and prices for all 13 unowned backgrounds without creating image or preview DOM', async () => {
  render(<AvatarRoom {...props} />);
  await openShop();
  const backgrounds = roomItems.filter((item) => item.category === 'background');
  expect(roomItems).toHaveLength(42);
  expect(backgrounds).toHaveLength(14);
  expect(backgrounds.filter((item) => item.price > 0)).toHaveLength(13);
  expect(screen.getAllByTestId('room-item')).toHaveLength(14);
  for (const item of backgrounds.filter((entry) => entry.price > 0)) {
    const entry = card(item.id);
    expect(entry).toHaveAttribute('data-owned', 'false');
    expect(entry.querySelectorAll(imageSelectors)).toHaveLength(0);
    expect(within(entry).getByRole('heading', { name: item.name })).toBeVisible();
    expect(within(entry).getByText(item.description, { exact: true })).toBeVisible();
    expect(
      within(entry).getByRole('button', {
        name: `${item.name} ${item.price} XP로 구매하고 장착`,
      }),
    ).toBeEnabled();
    expect(entry).toHaveTextContent(`${item.price.toLocaleString('ko-KR')} XP`);
  }
  expect(card('mint-room').querySelector('.avatar-room-scene')).not.toBeNull();
});

it('shows previews for every owned background, including those not currently equipped', async () => {
  const backgrounds = roomItems.filter((item) => item.category === 'background');
  render(<AvatarRoom {...props} ownedItemIds={backgrounds.map((item) => item.id)} />);
  await openShop();
  for (const item of backgrounds) {
    const entry = card(item.id);
    expect(entry).toHaveAttribute('data-owned', 'true');
    const preview = entry.querySelector('.avatar-room-scene');
    expect(preview).toHaveAttribute('data-background-id', item.id);
    expect(preview?.querySelector('svg')).not.toBeNull();
    if (item.price > 0)
      expect(within(entry).getByRole('button', { name: `${item.name} 무료로 장착` })).toBeEnabled();
  }
});

it('reveals a new background only after the purchase result grants ownership and keeps other owned previews visible', async () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <AvatarRoom {...props} ownedItemIds={['sky-garden']} onSelect={onSelect} />,
  );
  const user = await openShop();
  expect(card('rain-library').querySelectorAll(imageSelectors)).toHaveLength(0);
  await user.click(within(card('rain-library')).getByRole('button'));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('rain-library');
  // Clicking is not ownership; only the committed storage result reveals the art.
  expect(card('rain-library').querySelectorAll(imageSelectors)).toHaveLength(0);
  rerender(
    <AvatarRoom
      {...props}
      ownedItemIds={['sky-garden', 'rain-library']}
      room={{ ...defaultRoom, backgroundId: 'rain-library' }}
      balance={8_000}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByTestId('avatar-room-scene')).toHaveAttribute(
    'data-background-id',
    'rain-library',
  );
  expect(card('rain-library').querySelector('.avatar-room-scene')).not.toBeNull();
  expect(card('sky-garden').querySelector('.avatar-room-scene')).not.toBeNull();
  expect(card('bamboo-hideout').querySelectorAll(imageSelectors)).toHaveLength(0);
  expect(within(card('rain-library')).getByRole('button')).toBeDisabled();
  expect(screen.getByTestId('room-shop-balance')).toHaveTextContent('8,000 XP');
});

it('keeps outfit and accessory previews visible before purchase', async () => {
  render(<AvatarRoom {...props} />);
  const user = await openShop();
  for (const category of ['옷', '액세서리']) {
    await user.click(screen.getByRole('tab', { name: category }));
    const entries = screen.getAllByTestId('room-item');
    expect(entries).toHaveLength(14);
    for (const entry of entries)
      expect(entry.querySelector('.room-item-preview svg')).not.toBeNull();
  }
});

it.each(['monchichi', 'sichiware', 'sipompurin'] as const)(
  'offers ten new accessory previews and purchase actions for %s before ownership',
  async (avatar) => {
    const onSelect = vi.fn();
    render(<AvatarRoom {...props} avatar={avatar} onSelect={onSelect} />);
    const user = await openShop();
    await user.click(screen.getByRole('tab', { name: '액세서리' }));
    expect(screen.getAllByTestId('room-item')).toHaveLength(14);
    const added = [
      'mint-ribbon',
      'star-hairpin',
      'moon-hairpin',
      'butterfly-clip',
      'daisy-pin',
      'pearl-headband',
      'heart-sunglasses',
      'mint-scarf',
      'lucky-clover',
      'blue-beret',
    ];
    for (const id of added) {
      const item = roomItems.find((entry) => entry.id === id)!;
      const entry = card(id);
      expect(entry).toHaveAttribute('data-owned', 'false');
      expect(entry.querySelector('.room-item-preview svg')).not.toBeNull();
      expect(within(entry).getByRole('heading', { name: item.name })).toBeVisible();
      expect(within(entry).getByText(item.description, { exact: true })).toBeVisible();
      expect(
        within(entry).getByRole('button', { name: `${item.name} 2500 XP로 구매하고 장착` }),
      ).toBeEnabled();
      expect(entry).toHaveTextContent('2,500 XP');
    }
    await user.click(within(card('mint-ribbon')).getByRole('button'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('mint-ribbon');
    expect(card('mint-ribbon')).toHaveAttribute('data-owned', 'false');
    expect(screen.getByTestId('avatar-room')).toHaveAttribute('data-avatar-id', avatar);
    expect(screen.getByTestId('avatar-room')).toHaveAttribute('data-accessory-id', 'none');
  },
);

it.each(['monchichi', 'sichiware', 'sipompurin'] as const)(
  'offers standard and premium new outfits with previews and purchase actions for %s',
  async (avatar) => {
    const onSelect = vi.fn();
    render(<AvatarRoom {...props} avatar={avatar} onSelect={onSelect} />);
    const user = await openShop();
    await user.click(screen.getByRole('tab', { name: '옷' }));
    expect(screen.getAllByTestId('room-item')).toHaveLength(14);
    const added = [
      ['nike-hoodie', 7_000],
      ['adidas-puffer', 7_000],
      ['burberry-coat', 7_000],
      ['mint-cardigan', 6_000],
      ['denim-jacket', 6_000],
      ['striped-knit', 6_000],
      ['lavender-sweater', 6_000],
      ['raincoat', 6_000],
      ['cozy-fleece', 6_000],
      ['ribbon-dress', 6_000],
    ] as const;
    for (const [id, price] of added) {
      const outfit = roomItems.find((entry) => entry.id === id)!;
      const entry = card(id);
      expect(outfit.price).toBe(price);
      expect(entry).toHaveAttribute('data-owned', 'false');
      expect(entry.querySelector('.room-item-preview svg')).not.toBeNull();
      expect(within(entry).getByRole('heading', { name: outfit.name })).toBeVisible();
      expect(within(entry).getByText(outfit.description, { exact: true })).toBeVisible();
      expect(
        within(entry).getByRole('button', { name: `${outfit.name} ${price} XP로 구매하고 장착` }),
      ).toBeEnabled();
      expect(entry).toHaveTextContent(`${price.toLocaleString('ko-KR')} XP`);
    }
    await user.click(within(card('nike-hoodie')).getByRole('button'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('nike-hoodie');
    expect(card('nike-hoodie')).toHaveAttribute('data-owned', 'false');
    expect(screen.getByTestId('avatar-room')).toHaveAttribute('data-avatar-id', avatar);
    expect(screen.getByTestId('avatar-room')).toHaveAttribute('data-outfit-id', 'original');
  },
);
