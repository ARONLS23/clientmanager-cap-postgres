using {arrows.cap.cli as cli} from '../db/schema';

service ManagerClientService {
    entity Clients        as projection on cli.Client;
    entity Projects       as projection on cli.Project;
    entity ProjectMembers as projection on cli.ProjectMember;
    entity Tasks          as projection on cli.Task;
    entity Documents      as projection on cli.Document;
}
