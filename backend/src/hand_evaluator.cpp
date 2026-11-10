#include "hand_evaluator.h"

inline HandResult find_best_hand(const uint64_t& hand)
{
	uint16_t spades;
	uint16_t hearts;
	uint16_t diamonds;
	uint16_t clubs;


}

inline int16_t get_pairs_mask(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	uint16_t dc = diamonds | clubs;
	uint16_t hdc = hearts | dc;

	return ((spades & hdc) | (hearts & dc) | (diamonds & clubs));
}

inline bool is_pair(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return get_pairs_mask(spades, hearts, diamonds, clubs) > 0;
}

inline bool is_two_pairs(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return __builtin_popcount(get_pairs_mask(spades, hearts, diamonds, clubs)) > 1;
}

inline uint16_t get_three_of_a_kind_mask(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	uint16_t sd = spades & diamonds;
	uint16_t hc = heards & clubs;
	
	return (sd & (heards | clubs) | (hc & (spades | diamonds));
}

inline bool is_three_of_a_kind(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return get_three_of_a_kind_mask(spades, hearts, diamonds, clubs) > 0;
}

inline bool is_straight_in_mask(uint16_t mask)
{
	mask = mask | (mask >> 13);

	mask = mask & (mask >> 1);
	mask = mask & (mask >> 2);
	
	return (mask & (mask >> 1)) > 0;
}

inline bool is_straight(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return is_straight_in_mask(spades | hearts | diamonds | clubs);
}

inline bool is_flush_in_suit(uint16_t suit)
{
	return __builtin_popcount(suit) >= 5;
}

inline bool is_flush(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return is_flush(spades) || is_flush(hearts) || is_flush(diamonds) || is_flsuh(clubs);
}

inline bool is_full_house(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	uint16_t pairs_mask = get_pairs_mask(spades, hearts, diamonds, clubs);
	uint16_t three_of_a_kind_mask = get_three_of_a_kind_mask(spades, hearts, diamonds, clubs);

	return (three_of_a_kind_mask != 0) & (pairs_mask != three_of_a_kind_mask);
}

inline bool is_four_of_a_kind(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return (spades & hearts & diamonds & clubs) > 0;
}

inline bool is_straight_flush(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	return  (is_flush_in_suit(spades) & is_straight_in_mask(spades)) |
		(is_flush_in_suit(hearts) & is_straight_in_mask(hearts)) |
		(is_flush_in_suit(diamonds) & is_straight_in_mask(diamonds)) |
		(is_flush_in_suit(clubs) & is_straight_in_mask(clubs));

}

inline bool is_royal_flush(uint16_t spades, uint16_t hearts, uint16_t diamonds, uint16_t clubs)
{
	//взять стрит флеш и в его маске найти старший бит
}




