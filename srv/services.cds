using {arrows.cap.cli as cli} from '../db/schema';

service ManagerClientService {
    entity Clients as projection on cli.client;
}
