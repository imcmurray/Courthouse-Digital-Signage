// Backward compatibility re-exports — use ../api/contentCards instead
export {
  type ContentCardDisplay as IdleContentCardDisplay,
  type ContentCard as IdleContentCard,
  type CreateContentCardInput as CreateIdleContentCardInput,
  type UpdateContentCardInput as UpdateIdleContentCardInput,
  type CreateEmergencyCardInput,
  type ContentCardsResponse as IdleContentCardsResponse,
  contentCardsApi as idleContentCardsApi,
  contentCardsApi as default,
} from './contentCards';
