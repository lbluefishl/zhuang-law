export const FONTS = {
  default: { label: 'Plain', family: 'inherit' },
  handwriting: { label: 'Handwriting', family: "'Caveat', cursive" },
  script: { label: 'Script', family: "'Pacifico', cursive" },
  rounded: { label: 'Rounded', family: "'Quicksand', sans-serif" },
};

export const COLORS = {
  yellow: '#fff3b0',
  pink: '#ffd6e8',
  blue: '#cfe8ff',
  green: '#d7f2d0',
  purple: '#e4d4f4',
  orange: '#ffe0c2',
};

export const BORDERS = ['none', 'solid', 'dashed', 'tape'];

export const DECORATIONS = ['', '🎉', '🎂', '✨', '🌸', '💛'];

export const MAX_MESSAGE_LENGTH = 240;

export async function loadBoard(supabaseClient, slug) {
  const { data, error } = await supabaseClient.from('boards').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

export async function loadMessages(supabaseClient, boardId) {
  const { data, error } = await supabaseClient
    .from('board_messages')
    .select('id, slot_index, body, font, note_color, border_style, decoration, user_id, profiles(display_name)')
    .eq('board_id', boardId);
  if (error) throw error;
  return data;
}

export async function upsertMyMessage(supabaseClient, { boardId, userId, existingId, slotIndex, body, font, noteColor, borderStyle, decoration }) {
  const row = {
    board_id: boardId,
    user_id: userId,
    slot_index: slotIndex,
    body,
    font,
    note_color: noteColor,
    border_style: borderStyle,
    decoration: decoration || null,
    updated_at: new Date().toISOString(),
  };
  if (existingId) {
    const { error } = await supabaseClient.from('board_messages').update(row).eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('board_messages').insert(row);
    if (error) {
      if (error.code === '23505') throw new Error('SLOT_TAKEN'); // unique constraint race
      throw error;
    }
  }
}

export async function deleteMyMessage(supabaseClient, id) {
  const { error } = await supabaseClient.from('board_messages').delete().eq('id', id);
  if (error) throw error;
}
